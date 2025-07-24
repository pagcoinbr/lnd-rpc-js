/**
 * PaymentProcessor - Classe principal responsável pelo processamento de pagamentos
 * 
 * Esta classe orquestra todo o fluxo de pagamentos, desde o recebimento da requisição
 * até a conclusão do pagamento e notificação via webhook. Suporta múltiplas redes:
 * - Bitcoin (on-chain)
 * - Lightning Network 
 * - Liquid Network
 * 
 * Funcionalidades principais:
 * - Processamento de pagamentos por rede
 * - Gerenciamento de arquivos de requisição
 * - Controle de status e histórico
 * - Integração com webhooks
 * - Detecção automática de tipos de endereço/invoice
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config.json');
const LightningRPC = require('./rpc/lightning-rpc');
const LiquidRPC = require('./rpc/liquid-rpc');
const WebhookManager = require('./webhook-manager');

class PaymentProcessor {
  /**
   * Construtor da classe PaymentProcessor
   * 
   * Inicializa todas as dependências necessárias para o processamento de pagamentos:
   * - Clientes RPC para Lightning e Liquid networks
   * - Gerenciador de webhooks para notificações
   * - Logger para rastreamento de operações
   * 
   * @param {Object} logger - Instância do logger Winston para logs estruturados
   */
  constructor(logger) {
    this.logger = logger;
    
    // Inicializar cliente RPC Lightning/Bitcoin - manuseia tanto pagamentos Lightning quanto Bitcoin on-chain
    this.lightningRPC = new LightningRPC(config.lightning, logger);
    
    // Inicializar cliente RPC Liquid - para pagamentos na rede Liquid/Elements
    this.liquidRPC = new LiquidRPC(config.liquid, logger);
    
    // Inicializar gerenciador de webhooks para notificações de status
    this.webhookManager = new WebhookManager(logger);
  }

  /**
   * Processa uma requisição de pagamento completa
   * 
   * Este é o método principal que orquestra todo o fluxo de pagamento:
   * 1. Validação da requisição
   * 2. Envio de webhook de status "pendente"
   * 3. Roteamento para a rede apropriada (Bitcoin/Lightning/Liquid)
   * 4. Execução do pagamento
   * 5. Atualização do status e dados da transação
   * 6. Envio de webhook de conclusão/erro
   * 7. Gerenciamento de arquivos (mover de payment_req para payment_sent)
   * 
   * @param {Object} paymentRequest - Objeto contendo dados da requisição de pagamento
   * @param {string} paymentRequest.id - ID único da requisição
   * @param {string} paymentRequest.network - Rede de destino (bitcoin/lightning/liquid)
   * @param {string} paymentRequest.destinationWallet - Endereço/invoice de destino
   * @param {number} paymentRequest.amount - Valor em satoshis
   * @param {string} [paymentRequest.webhookUrl] - URL para notificações
   * @param {string} [paymentRequest.webhookSecret] - Chave secreta para assinatura do webhook
   * @returns {Promise<Object>} Resultado do pagamento com hash da transação e taxa
   * @throws {Error} Erros de validação, rede ou processamento
   */
  async processPayment(paymentRequest) {
    try {
      this.logger.info(`Processando pagamento: ${paymentRequest.id}`);
      
      // ========== FASE 1: WEBHOOK DE PAGAMENTO PENDENTE ==========
      // Notificar sistema externo que o pagamento foi recebido e está sendo processado
      if (paymentRequest.webhookUrl) {
        await this.webhookManager.sendPaymentPendingWebhook(
          paymentRequest.webhookUrl, 
          paymentRequest,
          paymentRequest.webhookSecret
        );
      }
      
      // ========== FASE 2: ROTEAMENTO POR REDE ==========
      let result;
      const network = paymentRequest.network.toLowerCase();
      
      // Determinar qual RPC usar baseado na rede especificada
      switch (network) {
        case 'bitcoin':
        case 'lightning':
          // Usar Lightning RPC para ambos Bitcoin on-chain e Lightning Network
          // O Lightning RPC detectará automaticamente o tipo baseado no formato do destino
          // (endereço Bitcoin vs invoice Lightning vs Lightning Address)
          result = await this.lightningRPC.sendPayment(
            paymentRequest.destinationWallet,
            paymentRequest.amount
          );
          break;
          
        case 'liquid':
          // Usar Liquid RPC para pagamentos na rede Liquid/Elements
          result = await this.liquidRPC.sendPayment(
            paymentRequest.destinationWallet,
            paymentRequest.amount
          );
          break;
          
        default:
          throw new Error(`Rede não suportada: ${network}`);
      }
      
      // ========== FASE 3: ATUALIZAÇÃO DOS DADOS DA REQUISIÇÃO ==========
      // Atualizar status e adicionar informações da transação concluída
      paymentRequest.status = 'sent';
      paymentRequest.transactionHash = result.transactionHash;
      paymentRequest.completedAt = new Date().toISOString();
      paymentRequest.networkFee = result.fee || 0;
      
      // ========== FASE 4: WEBHOOK DE PAGAMENTO CONCLUÍDO ==========
      // Notificar sistema externo que o pagamento foi enviado com sucesso
      if (paymentRequest.webhookUrl) {
        await this.webhookManager.sendPaymentCompletedWebhook(
          paymentRequest.webhookUrl, 
          paymentRequest,
          paymentRequest.webhookSecret
        );
      }
      
      // ========== FASE 5: GERENCIAMENTO DE ARQUIVOS ==========
      // Mover arquivo de payment_req (pendentes) para payment_sent (concluídos)
      await this.movePaymentFile(paymentRequest);
      
      this.logger.info(`Pagamento concluído: ${paymentRequest.id}, Hash: ${result.transactionHash}`);
      
      return result;
      
    } catch (error) {
      // ========== TRATAMENTO DE ERRO ==========
      this.logger.error(`Erro ao processar pagamento ${paymentRequest.id}: ${error.message}`, error);
      
      // Atualizar status para erro com detalhes
      paymentRequest.status = 'error';
      paymentRequest.error = error.message;
      paymentRequest.errorAt = new Date().toISOString();
      
      // Notificar sistema externo sobre a falha
      if (paymentRequest.webhookUrl) {
        await this.webhookManager.sendPaymentFailedWebhook(
          paymentRequest.webhookUrl, 
          paymentRequest,
          paymentRequest.webhookSecret
        );
      }
      
      // Salvar arquivo com informações de erro para análise posterior
      await this.savePaymentWithError(paymentRequest);
      
      // Re-propagar o erro para o caller
      throw error;
    }
  }

  /**
   * Move arquivo de requisição de payment_req para payment_sent
   * 
   * Este método gerencia o ciclo de vida dos arquivos de requisição:
   * - Salva o arquivo atualizado (com dados da transação) em payment_sent/
   * - Remove o arquivo original de payment_req/
   * - Mantém a estrutura de nomenclatura: {id}_{transactionId}.json
   * 
   * @param {Object} paymentRequest - Objeto da requisição com dados atualizados
   */
  async movePaymentFile(paymentRequest) {
    const sourceFile = path.join(__dirname, '../payment_req', `${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    const destFile = path.join(__dirname, '../payment_sent', `${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    
    // Salvar arquivo atualizado no diretório payment_sent com todas as informações da transação
    fs.writeFileSync(destFile, JSON.stringify(paymentRequest, null, 2));
    
    // Remover arquivo original do diretório payment_req para evitar reprocessamento
    if (fs.existsSync(sourceFile)) {
      fs.unlinkSync(sourceFile);
    }
    
    this.logger.info(`Arquivo movido: ${sourceFile} -> ${destFile}`);
  }

  /**
   * Salva requisição com erro para análise posterior
   * 
   * Quando um pagamento falha, este método preserva todos os dados para debugging:
   * - Salva no diretório payment_req com prefixo "ERROR_"
   * - Inclui mensagem de erro e timestamp
   * - Permite reprocessamento manual se necessário
   * 
   * @param {Object} paymentRequest - Objeto da requisição com dados de erro
   */
  async savePaymentWithError(paymentRequest) {
    const errorFile = path.join(__dirname, '../payment_req', `ERROR_${paymentRequest.id}_${paymentRequest.transactionId}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(paymentRequest, null, 2));
    this.logger.info(`Arquivo de erro salvo: ${errorFile}`);
  }

  /**
   * Obtém saldo de uma rede específica
   * 
   * Este método redireciona consultas de saldo para o cliente RPC apropriado:
   * - 'bitcoin': Saldo on-chain via Lightning RPC
   * - 'lightning': Saldo dos canais Lightning 
   * - 'liquid': Saldo na rede Liquid
   * 
   * @param {string} network - Rede para consultar ('bitcoin', 'lightning', 'liquid')
   * @returns {Promise<Object>} Objeto com informações de saldo da rede
   * @throws {Error} Se a rede não for suportada
   */
  async getBalance(network) {
    switch (network) {
      case 'bitcoin':
        // Usar Lightning RPC para saldo on-chain do Bitcoin
        // (LND manuseia tanto Lightning quanto Bitcoin on-chain)
        return await this.lightningRPC.getOnChainBalance();
        
      case 'lightning':
        // Usar Lightning RPC para saldo dos canais Lightning Network
        return await this.lightningRPC.getChannelBalance();
        
      case 'liquid':
        // Usar Liquid RPC para saldo na rede Liquid/Elements
        return await this.liquidRPC.getBalance();
        
      default:
        throw new Error(`Rede não suportada: ${network}`);
    }
  }

  /**
   * Detecta automaticamente o tipo de endereço ou invoice
   * 
   * Analisa o formato do destino para determinar qual rede/protocolo usar:
   * - Lightning invoices (bolt11): começam com "ln"
   * - Lightning addresses: formato email (usuario@dominio.com)
   * - Bitcoin addresses: P2PKH, P2SH, Bech32, Taproot
   * - Liquid addresses: formatos específicos da rede Liquid
   * 
   * Esta detecção é crucial para o roteamento automático de pagamentos.
   * 
   * @param {string} address - Endereço, invoice ou Lightning address
   * @returns {string} Tipo detectado ('lightning', 'bitcoin', 'liquid', 'unknown')
   */
  detectAddressType(address) {
    // ========== LIGHTNING NETWORK ==========
    // Lightning invoice (bolt11) - formato padrão dos invoices Lightning
    if (address.toLowerCase().startsWith('ln')) {
      return 'lightning';
    }
    
    // Lightning address (usuario@dominio.com) - protocolo LNURL-pay
    if (address.includes('@') && address.split('@').length === 2) {
      const [username, domain] = address.split('@');
      if (username && domain && domain.includes('.')) {
        return 'lightning';
      }
    }
    
    // ========== BITCOIN NETWORK ==========
    // Bitcoin address patterns usando regex para validação precisa
    if (address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/) || // Legacy (P2PKH/P2SH)
        address.match(/^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/) ||     // Bech32 (P2WPKH/P2WSH)
        address.match(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {    // P2SH (SegWit wrapped)
      return 'bitcoin';
    }
    
    // ========== LIQUID NETWORK ==========
    // Liquid address patterns - diferentes da mainnet Bitcoin
    if (address.match(/^[2-9A-HJ-NP-Z][1-9A-HJ-NP-Za-km-z]{25,39}$/) || // Liquid legacy
        address.match(/^lq1[a-zA-HJ-NP-Z0-9]{39,59}$/)) {                // Liquid bech32
      return 'liquid';
    }
    
    // Se não corresponder a nenhum padrão conhecido
    return 'unknown';
  }

  /**
   * Obtém saldos de todas as redes simultaneamente
   * 
   * Método de conveniência que consulta todos os saldos em paralelo:
   * - Bitcoin on-chain
   * - Lightning channels
   * - Liquid network
   * 
   * Útil para dashboards e relatórios que precisam de visão geral completa.
   * 
   * @returns {Promise<Object>} Objeto com saldos de todas as redes e timestamp
   * @throws {Error} Se houver erro em qualquer consulta
   */
  async getAllBalances() {
    try {
      // Executar todas as consultas em paralelo para melhor performance
      const [bitcoinBalance, lightningBalance, liquidBalance] = await Promise.all([
        this.lightningRPC.getOnChainBalance(),
        this.lightningRPC.getChannelBalance(),
        this.liquidRPC.getBalance()
      ]);

      return {
        bitcoin: bitcoinBalance,
        lightning: lightningBalance,
        liquid: liquidBalance,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Erro ao obter todos os saldos:', error);
      throw error;
    }
  }
}

module.exports = PaymentProcessor;
