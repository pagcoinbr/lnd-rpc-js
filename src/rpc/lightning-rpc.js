/**
 * LIGHTNING-RPC.JS - Cliente RPC para Lightning Network Daemon (LND)
 * 
 * Esta classe implementa um cliente completo para comunicação com o LND via gRPC.
 * O LND é um dos principais implementações do Lightning Network e também
 * manuseia operações Bitcoin on-chain.
 * 
 * FUNCIONALIDADES PRINCIPAIS:
 * - Pagamentos Lightning Network (invoices e Lightning addresses)
 * - Transações Bitcoin on-chain
 * - Consulta de saldos (on-chain e canais)
 * - Geração de endereços Bitcoin
 * - Criação de invoices Lightning
 * - Resolução automática de Lightning addresses (LNURL-pay)
 * 
 * PROTOCOLOS SUPORTADOS:
 * - Lightning Network (BOLT11 invoices)
 * - Lightning addresses (via LNURL-pay)
 * - Bitcoin on-chain (todos os tipos de endereço)
 * - gRPC com autenticação por macaroon
 * 
 * SEGURANÇA:
 * - Conexão TLS com certificado personalizado
 * - Autenticação via macaroon
 * - Validação de endereços e invoices
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class LightningRPC {
  /**
   * Construtor do cliente Lightning RPC
   * 
   * Inicializa a conexão gRPC com o LND usando certificado TLS
   * e macaroon para autenticação.
   * 
   * @param {Object} config - Configuração de conexão
   * @param {string} config.host - Host do LND (formato host:porta)
   * @param {string} config.tlsCertPath - Caminho para certificado TLS
   * @param {string} config.macaroonPath - Caminho para arquivo macaroon
   * @param {Object} logger - Instância do logger Winston
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = null;
    this.initClient();
  }

  /**
   * Inicializa cliente gRPC para comunicação com LND
   * 
   * Configura conexão segura com o Lightning Network Daemon:
   * 1. Carrega arquivo de definição proto (lightning.proto)
   * 2. Lê certificado TLS para conexão segura
   * 3. Lê macaroon para autenticação
   * 4. Configura credenciais combinadas (TLS + macaroon)
   * 5. Cria cliente gRPC Lightning
   * 
   * REQUISITOS:
   * - Arquivo lightning.proto no diretório proto/
   * - Certificado TLS válido
   * - Macaroon com permissões adequadas
   * - LND executando e acessível
   */
  initClient() {
    try {
      // ========== CONFIGURAÇÃO DE CIPHER SUITE ==========
      // Configurar cipher suite para ECDSA (requerido pelo LND)
      process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

      // ========== CONFIGURAÇÃO DO PROTO LOADER ==========
      const loaderOptions = {
        keepCase: true,    // Manter nomes de campos como no proto
        longs: String,     // Converter longs para string (JavaScript limitation)
        enums: String,     // Converter enums para string
        defaults: true,    // Incluir valores padrão
        oneofs: true       // Suportar campos oneof
      };

      // ========== CARREGAMENTO DO ARQUIVO PROTO ==========
      const protoPath = path.join(__dirname, '../../proto/lightning.proto');
      
      if (!fs.existsSync(protoPath)) {
        this.logger.warn('Arquivo lightning.proto não encontrado. Baixe de: https://github.com/lightningnetwork/lnd/blob/master/lnrpc/lightning.proto');
        return;
      }

      const packageDefinition = protoLoader.loadSync(protoPath, loaderOptions);

      // ========== LEITURA DO CERTIFICADO TLS ==========
      let lndCert;
      try {
        const certPath = this.config.tlsCertPath.replace('~', process.env.HOME);
        lndCert = fs.readFileSync(certPath);
      } catch (error) {
        this.logger.error(`Erro ao ler certificado TLS: ${error.message}`);
        return;
      }

      // ========== LEITURA DO MACAROON ==========
      let macaroon;
      try {
        const macaroonPath = this.config.macaroonPath.replace('~', process.env.HOME);
        const m = fs.readFileSync(macaroonPath);
        macaroon = m.toString('hex'); // Converter para hexadecimal
      } catch (error) {
        this.logger.error(`Erro ao ler macaroon: ${error.message}`);
        return;
      }

      // ========== CONFIGURAÇÃO DE CREDENCIAIS SSL ==========
      const sslCreds = grpc.credentials.createSsl(lndCert);

      // ========== CONFIGURAÇÃO DE CREDENCIAIS MACAROON ==========
      const metadata = new grpc.Metadata();
      metadata.add('macaroon', macaroon);
      const macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
        callback(null, metadata);
      });

      // ========== COMBINAÇÃO DE CREDENCIAIS ==========
      const credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

      // ========== CRIAÇÃO DO CLIENTE GRPC ==========
      const lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const lnrpc = lnrpcDescriptor.lnrpc;
      this.client = new lnrpc.Lightning(this.config.host, credentials);

      this.logger.info('Cliente Lightning RPC inicializado com sucesso');

    } catch (error) {
      this.logger.error(`Erro ao inicializar cliente Lightning: ${error.message}`, error);
    }
  }

  /**
   * Obtém saldo da carteira Bitcoin on-chain
   * 
   * Consulta o saldo Bitcoin disponível na carteira on-chain do LND.
   * Este saldo pode ser usado para:
   * - Enviar transações Bitcoin on-chain
   * - Abrir canais Lightning
   * - Fechar canais Lightning
   * 
   * @returns {Promise<Object>} Objeto com saldos em satoshis
   * @returns {number} returns.confirmed - Saldo confirmado (6+ confirmações)
   * @returns {number} returns.unconfirmed - Saldo não confirmado (< 6 confirmações)
   * @returns {number} returns.total - Saldo total (confirmed + unconfirmed)
   */
  async getBalance() {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.walletBalance({}, (err, response) => {
        if (err) {
          this.logger.error('Erro ao consultar saldo Lightning:', err);
          reject(err);
          return;
        }

        resolve({
          confirmed: parseInt(response.confirmed_balance || 0),
          unconfirmed: parseInt(response.unconfirmed_balance || 0),
          total: parseInt(response.total_balance || 0)
        });
      });
    });
  }

  /**
   * Método alias para getBalance() - para compatibilidade
   * 
   * Mantém compatibilidade com código que espera método específico
   * para saldo on-chain.
   * 
   * @returns {Promise<Object>} Mesmo retorno de getBalance()
   */
  async getOnChainBalance() {
    return await this.getBalance();
  }

  /**
   * Obtém saldo dos canais Lightning Network
   * 
   * Consulta o saldo disponível nos canais Lightning ativos.
   * Este saldo pode ser usado para pagamentos Lightning instantâneos.
   * 
   * TIPOS DE SALDO:
   * - balance: Saldo disponível para envio em canais ativos
   * - pendingOpenBalance: Saldo em canais sendo abertos (não utilizável ainda)
   * 
   * @returns {Promise<Object>} Objeto com saldos dos canais em satoshis
   * @returns {number} returns.balance - Saldo disponível nos canais ativos
   * @returns {number} returns.pendingOpenBalance - Saldo em canais pendentes
   */
  async getChannelBalance() {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.channelBalance({}, (err, response) => {
        if (err) {
          this.logger.error('Erro ao consultar saldo dos canais:', err);
          reject(err);
          return;
        }

        resolve({
          balance: parseInt(response.balance || 0),
          pendingOpenBalance: parseInt(response.pending_open_balance || 0)
        });
      });
    });
  }

  /**
   * Resolve Lightning Address para invoice usando protocolo LNURL-pay
   * 
   * Lightning addresses (formato email) são uma abstração sobre LNURL-pay
   * que permite pagamentos mais simples sem precisar gerar invoices manualmente.
   * 
   * PROCESSO DE RESOLUÇÃO:
   * 1. Parse do endereço (usuario@dominio.com)
   * 2. Consulta LNURL endpoint (.well-known/lnurlp/usuario)
   * 3. Validação de limites de valor
   * 4. Solicitação de invoice com valor específico
   * 5. Retorno do invoice bolt11 para pagamento
   * 
   * @param {string} lightningAddress - Lightning address no formato usuario@dominio.com
   * @param {number} amountSats - Valor em satoshis a ser pago
   * @returns {Promise<string>} Invoice bolt11 pronto para pagamento
   * @throws {Error} Se address for inválido, valor fora dos limites ou falha na resolução
   */
  async resolveLightningAddress(lightningAddress, amountSats) {
    try {
      // ========== PARSE DO LIGHTNING ADDRESS ==========
      const [username, domain] = lightningAddress.split('@');
      
      // ========== CONSULTA LNURL ENDPOINT ==========
      // Seguir especificação LNURL-pay para descoberta do endpoint
      const lnurlResponse = await axios.get(`https://${domain}/.well-known/lnurlp/${username}`);
      const lnurlData = lnurlResponse.data;
      
      // Verificar se houve erro na resposta LNURL
      if (lnurlData.status === 'ERROR') {
        throw new Error(`LNURL Error: ${lnurlData.reason}`);
      }
      
      // ========== VALIDAÇÃO DE LIMITES ==========
      // Converter satoshis para millisatoshis (unidade do Lightning Network)
      const amountMsats = amountSats * 1000;
      if (amountMsats < lnurlData.minSendable || amountMsats > lnurlData.maxSendable) {
        throw new Error(`Valor fora dos limites: ${lnurlData.minSendable/1000} - ${lnurlData.maxSendable/1000} sats`);
      }
      
      // ========== SOLICITAÇÃO DE INVOICE ==========
      // Chamar callback com valor específico para obter invoice
      const invoiceResponse = await axios.get(`${lnurlData.callback}?amount=${amountMsats}`);
      const invoiceData = invoiceResponse.data;
      
      // Verificar se houve erro na geração do invoice
      if (invoiceData.status === 'ERROR') {
        throw new Error(`Invoice Error: ${invoiceData.reason}`);
      }
      
      return invoiceData.pr; // payment request (invoice bolt11)
      
    } catch (error) {
      this.logger.error(`Erro ao resolver Lightning Address: ${error.message}`, error);
      throw error;
    }
  }

  async payInvoice(paymentRequest) {
    return new Promise((resolve, reject) => {
      this.client.sendPaymentSync({
        payment_request: paymentRequest
      }, (err, response) => {
        if (err) {
          this.logger.error('Erro ao enviar pagamento Lightning:', err);
          reject(err);
          return;
        }

        if (response.payment_error) {
          reject(new Error(`Erro no pagamento: ${response.payment_error}`));
          return;
        }

        const preimage = Buffer.from(response.payment_preimage, 'base64');
        const hash = Buffer.from(response.payment_hash, 'base64');

        resolve({
          transactionHash: hash.toString('hex'),
          preimage: preimage.toString('hex'),
          fee: parseInt(response.payment_route?.total_fees || 0),
          route: response.payment_route
        });
      });
    });
  }

  async decodeInvoice(paymentRequest) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.decodePayReq({ pay_req: paymentRequest }, (err, response) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          destination: response.destination,
          amount: parseInt(response.num_satoshis || 0),
          timestamp: parseInt(response.timestamp || 0),
          expiry: parseInt(response.expiry || 0),
          description: response.description || '',
          paymentHash: response.payment_hash
        });
      });
    });
  }

  async createInvoice(amountSats, description = '') {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.addInvoice({
        value: amountSats,
        memo: description,
        expiry: 3600 // 1 hora
      }, (err, response) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          paymentRequest: response.payment_request,
          rHash: Buffer.from(response.r_hash, 'base64').toString('hex'),
          addIndex: response.add_index
        });
      });
    });
  }

  // ============ MÉTODOS ON-CHAIN ============

  async sendOnChain(destinationAddress, amountSats, feeRate = null) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      // Preparar parâmetros da transação
      const sendRequest = {
        addr: destinationAddress,
        amount: amountSats.toString()
      };

      // Se taxa específica foi fornecida
      if (feeRate) {
        sendRequest.sat_per_vbyte = feeRate;
      } else {
        // Usar estimativa automática
        sendRequest.target_conf = 6; // 6 confirmações como alvo
      }

      this.client.sendCoins(sendRequest, (err, response) => {
        if (err) {
          this.logger.error('Erro ao enviar transação on-chain:', err);
          reject(err);
          return;
        }

        resolve({
          transactionHash: response.txid,
          fee: parseInt(response.amount || 0) // Taxa em satoshis
        });
      });
    });
  }

  async getNewAddress(addressType = 'p2wkh') {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      // Mapear tipos de endereço
      let type = 0; // WITNESS_PUBKEY_HASH (p2wkh) - padrão
      switch (addressType.toLowerCase()) {
        case 'p2wkh':
        case 'bech32':
          type = 0; // WITNESS_PUBKEY_HASH
          break;
        case 'p2sh':
        case 'p2sh-segwit':
          type = 1; // NESTED_PUBKEY_HASH
          break;
        case 'p2tr':
        case 'taproot':
          type = 4; // TAPROOT_PUBKEY
          break;
      }

      this.client.newAddress({ type: type }, (err, response) => {
        if (err) {
          this.logger.error('Erro ao gerar novo endereço:', err);
          reject(err);
          return;
        }

        resolve(response.address);
      });
    });
  }

  async estimateFee(targetConf = 6) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.estimateFee({ 
        AddrToAmount: {}, // Mapa vazio para estimativa geral
        target_conf: targetConf 
      }, (err, response) => {
        if (err) {
          this.logger.error('Erro ao estimar taxa:', err);
          reject(err);
          return;
        }

        resolve({
          feeRate: parseInt(response.fee_sat || 0),
          targetConf: targetConf
        });
      });
    });
  }

  async getTransaction(txid) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.getTransactions({}, (err, response) => {
        if (err) {
          this.logger.error('Erro ao buscar transações:', err);
          reject(err);
          return;
        }

        // Buscar transação específica
        const transaction = response.transactions.find(tx => tx.tx_hash === txid);
        
        if (!transaction) {
          reject(new Error(`Transação não encontrada: ${txid}`));
          return;
        }

        resolve({
          txid: transaction.tx_hash,
          amount: parseInt(transaction.amount || 0),
          fee: parseInt(transaction.total_fees || 0),
          confirmations: parseInt(transaction.num_confirmations || 0),
          blockHeight: parseInt(transaction.block_height || 0),
          timestamp: parseInt(transaction.time_stamp || 0),
          destAddresses: transaction.dest_addresses || []
        });
      });
    });
  }

  async listTransactions(maxTransactions = 100) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      this.client.getTransactions({
        start_height: 0,
        end_height: -1,
        account: ''
      }, (err, response) => {
        if (err) {
          this.logger.error('Erro ao listar transações:', err);
          reject(err);
          return;
        }

        const transactions = response.transactions
          .slice(0, maxTransactions)
          .map(tx => ({
            txid: tx.tx_hash,
            amount: parseInt(tx.amount || 0),
            fee: parseInt(tx.total_fees || 0),
            confirmations: parseInt(tx.num_confirmations || 0),
            blockHeight: parseInt(tx.block_height || 0),
            timestamp: parseInt(tx.time_stamp || 0),
            destAddresses: tx.dest_addresses || []
          }));

        resolve(transactions);
      });
    });
  }

  // ============ MÉTODO UNIFICADO DE PAGAMENTO ============

  async sendPayment(destination, amountSats, options = {}) {
    try {
      // Detectar se é Lightning ou On-chain
      if (this.isLightningDestination(destination)) {
        // Lightning payment
        this.logger.info(`Enviando pagamento Lightning para: ${destination}`);
        return await this.sendLightningPayment(destination, amountSats);
      } else {
        // On-chain payment
        this.logger.info(`Enviando pagamento On-chain para: ${destination}`);
        return await this.sendOnChain(destination, amountSats, options.feeRate);
      }
    } catch (error) {
      this.logger.error(`Erro no pagamento unificado: ${error.message}`, error);
      throw error;
    }
  }

  // Renomear método original para ser mais específico
  async sendLightningPayment(paymentRequest, amountSats) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Cliente Lightning não inicializado'));
        return;
      }

      try {
        // Verificar se é lightning address ou invoice
        if (paymentRequest.includes('@')) {
          // Lightning Address - precisa resolver para invoice primeiro
          this.resolveLightningAddress(paymentRequest, amountSats)
            .then(invoice => this.payInvoice(invoice))
            .then(resolve)
            .catch(reject);
        } else {
          // Invoice direto
          this.payInvoice(paymentRequest)
            .then(resolve)
            .catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  isLightningDestination(destination) {
    // Lightning invoice (bolt11)
    if (destination.toLowerCase().startsWith('ln')) {
      return true;
    }
    
    // Lightning address
    if (destination.includes('@') && !destination.includes('.')) {
      return true;
    }
    
    // Assumir que é endereço Bitcoin se não for claramente Lightning
    return false;
  }
}

module.exports = LightningRPC;
