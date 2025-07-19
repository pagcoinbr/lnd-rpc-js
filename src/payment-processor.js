const fs = require('fs');
const path = require('path');
const config = require('../config/config.json');
const BitcoinRPC = require('./rpc/bitcoin-rpc');
const LightningRPC = require('./rpc/lightning-rpc');
const LiquidRPC = require('./rpc/liquid-rpc');

class PaymentProcessor {
  constructor(logger) {
    this.logger = logger;
    this.bitcoinRPC = new BitcoinRPC(config.bitcoin, logger);
    this.lightningRPC = new LightningRPC(config.lightning, logger);
    this.liquidRPC = new LiquidRPC(config.liquid, logger);
  }

  async processPayment(paymentRequest) {
    try {
      this.logger.info(`Processando pagamento: ${paymentRequest.id}`);
      
      let result;
      const network = paymentRequest.network.toLowerCase();
      
      // Determinar qual RPC usar baseado na rede
      switch (network) {
        case 'bitcoin':
          result = await this.bitcoinRPC.sendPayment(
            paymentRequest.destinationWallet,
            paymentRequest.amount
          );
          break;
          
        case 'lightning':
          result = await this.lightningRPC.sendPayment(
            paymentRequest.destinationWallet,
            paymentRequest.amount
          );
          break;
          
        case 'liquid':
          result = await this.liquidRPC.sendPayment(
            paymentRequest.destinationWallet,
            paymentRequest.amount
          );
          break;
          
        default:
          throw new Error(`Rede não suportada: ${network}`);
      }
      
      // Atualizar dados da requisição com o resultado
      paymentRequest.status = 'sent';
      paymentRequest.transactionHash = result.transactionHash;
      paymentRequest.completedAt = new Date().toISOString();
      paymentRequest.networkFee = result.fee || 0;
      
      // Mover arquivo de payment_req para payment_sent
      await this.movePaymentFile(paymentRequest);
      
      this.logger.info(`Pagamento concluído: ${paymentRequest.id}, Hash: ${result.transactionHash}`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`Erro ao processar pagamento ${paymentRequest.id}: ${error.message}`, error);
      
      // Atualizar status para erro
      paymentRequest.status = 'error';
      paymentRequest.error = error.message;
      paymentRequest.errorAt = new Date().toISOString();
      
      // Salvar arquivo com erro
      await this.savePaymentWithError(paymentRequest);
      
      throw error;
    }
  }

  async movePaymentFile(paymentRequest) {
    const sourceFile = path.join(__dirname, '../payment_req', `${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    const destFile = path.join(__dirname, '../payment_sent', `${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    
    // Salvar arquivo atualizado no diretório payment_sent
    fs.writeFileSync(destFile, JSON.stringify(paymentRequest, null, 2));
    
    // Remover arquivo original do diretório payment_req
    if (fs.existsSync(sourceFile)) {
      fs.unlinkSync(sourceFile);
    }
    
    this.logger.info(`Arquivo movido: ${sourceFile} -> ${destFile}`);
  }

  async savePaymentWithError(paymentRequest) {
    const errorFile = path.join(__dirname, '../payment_req', `ERROR_${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(paymentRequest, null, 2));
    this.logger.info(`Arquivo de erro salvo: ${errorFile}`);
  }

  async getBalance(network) {
    switch (network) {
      case 'bitcoin':
        return await this.bitcoinRPC.getBalance();
        
      case 'lightning':
        return await this.lightningRPC.getBalance();
        
      case 'liquid':
        return await this.liquidRPC.getBalance();
        
      default:
        throw new Error(`Rede não suportada: ${network}`);
    }
  }

  // Método para detectar tipo de endereço/invoice
  detectAddressType(address) {
    // Lightning invoice
    if (address.toLowerCase().startsWith('ln') || address.includes('@')) {
      return 'lightning';
    }
    
    // Bitcoin address patterns
    if (address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/) || // Legacy
        address.match(/^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/) ||     // Bech32
        address.match(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {    // P2SH
      return 'bitcoin';
    }
    
    // Liquid address patterns
    if (address.match(/^[2-9A-HJ-NP-Z][1-9A-HJ-NP-Za-km-z]{25,39}$/) ||
        address.match(/^lq1[a-zA-HJ-NP-Z0-9]{39,59}$/)) {
      return 'liquid';
    }
    
    return 'unknown';
  }
}

module.exports = PaymentProcessor;
