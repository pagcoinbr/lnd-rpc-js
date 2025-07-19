const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const path = require('path');

class LightningRPC {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = null;
    this.initClient();
  }

  initClient() {
    try {
      // Configurar cipher suite para ECDSA
      process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

      // Opções do proto loader
      const loaderOptions = {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      };

      // Carregar proto file - você precisa baixar o lightning.proto
      const protoPath = path.join(__dirname, '../../proto/lightning.proto');
      
      if (!fs.existsSync(protoPath)) {
        this.logger.warn('Arquivo lightning.proto não encontrado. Baixe de: https://github.com/lightningnetwork/lnd/blob/master/lnrpc/lightning.proto');
        return;
      }

      const packageDefinition = protoLoader.loadSync(protoPath, loaderOptions);

      // Ler certificado TLS
      let lndCert;
      try {
        const certPath = this.config.tlsCertPath.replace('~', process.env.HOME);
        lndCert = fs.readFileSync(certPath);
      } catch (error) {
        this.logger.error(`Erro ao ler certificado TLS: ${error.message}`);
        return;
      }

      // Ler macaroon
      let macaroon;
      try {
        const macaroonPath = this.config.macaroonPath.replace('~', process.env.HOME);
        const m = fs.readFileSync(macaroonPath);
        macaroon = m.toString('hex');
      } catch (error) {
        this.logger.error(`Erro ao ler macaroon: ${error.message}`);
        return;
      }

      // Criar credenciais SSL
      const sslCreds = grpc.credentials.createSsl(lndCert);

      // Criar credenciais do macaroon
      const metadata = new grpc.Metadata();
      metadata.add('macaroon', macaroon);
      const macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
        callback(null, metadata);
      });

      // Combinar credenciais
      const credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

      // Criar cliente
      const lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const lnrpc = lnrpcDescriptor.lnrpc;
      this.client = new lnrpc.Lightning(this.config.host, credentials);

      this.logger.info('Cliente Lightning RPC inicializado com sucesso');

    } catch (error) {
      this.logger.error(`Erro ao inicializar cliente Lightning: ${error.message}`, error);
    }
  }

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

  async sendPayment(paymentRequest, amountSats) {
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

  async resolveLightningAddress(lightningAddress, amountSats) {
    try {
      const [username, domain] = lightningAddress.split('@');
      
      // Fazer requisição LNURL
      const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);
      const lnurlData = await lnurlResponse.json();
      
      if (lnurlData.status === 'ERROR') {
        throw new Error(`LNURL Error: ${lnurlData.reason}`);
      }
      
      // Verificar se o valor está dentro dos limites
      const amountMsats = amountSats * 1000;
      if (amountMsats < lnurlData.minSendable || amountMsats > lnurlData.maxSendable) {
        throw new Error(`Valor fora dos limites: ${lnurlData.minSendable/1000} - ${lnurlData.maxSendable/1000} sats`);
      }
      
      // Solicitar invoice
      const invoiceResponse = await fetch(`${lnurlData.callback}?amount=${amountMsats}`);
      const invoiceData = await invoiceResponse.json();
      
      if (invoiceData.status === 'ERROR') {
        throw new Error(`Invoice Error: ${invoiceData.reason}`);
      }
      
      return invoiceData.pr; // payment request (invoice)
      
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
}

module.exports = LightningRPC;
