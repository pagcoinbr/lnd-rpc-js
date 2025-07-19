const axios = require('axios');

class BitcoinRPC {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.rpcUrl = `http://${config.rpcUser}:${config.rpcPassword}@${config.rpcHost}:${config.rpcPort}`;
  }

  async rpcCall(method, params = []) {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '1.0',
        id: 'bitcoin-rpc',
        method: method,
        params: params
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000
      });

      if (response.data.error) {
        throw new Error(`Bitcoin RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(`Bitcoin RPC call failed: ${method}`, error);
      throw new Error(`Bitcoin RPC call failed: ${error.message}`);
    }
  }

  async getBalance() {
    try {
      const balance = await this.rpcCall('getbalance');
      const unconfirmedBalance = await this.rpcCall('getunconfirmedbalance');
      
      return {
        confirmed: Math.round(balance * 100000000), // Convert to satoshis
        unconfirmed: Math.round(unconfirmedBalance * 100000000),
        total: Math.round((balance + unconfirmedBalance) * 100000000)
      };
    } catch (error) {
      this.logger.error('Erro ao consultar saldo Bitcoin:', error);
      throw error;
    }
  }

  async sendPayment(destinationAddress, amountSats) {
    try {
      // Converter satoshis para BTC
      const amountBTC = amountSats / 100000000;
      
      this.logger.info(`Enviando ${amountSats} sats (${amountBTC} BTC) para ${destinationAddress}`);
      
      // Verificar se o endereço é válido
      const isValid = await this.rpcCall('validateaddress', [destinationAddress]);
      if (!isValid.isvalid) {
        throw new Error(`Endereço Bitcoin inválido: ${destinationAddress}`);
      }
      
      // Estimar taxa de transação
      const feeRate = await this.estimateFee();
      
      // Enviar transação
      const txid = await this.rpcCall('sendtoaddress', [
        destinationAddress,
        amountBTC,
        '', // comment
        '', // comment_to
        false, // subtractfeefromamount
        true, // replaceable (RBF)
        null, // conf_target
        'unset', // estimate_mode
        null, // avoid_reuse
        feeRate // fee_rate
      ]);
      
      // Obter detalhes da transação
      const txDetails = await this.rpcCall('gettransaction', [txid]);
      
      return {
        transactionHash: txid,
        fee: Math.abs(Math.round(txDetails.fee * 100000000)), // Convert fee to satoshis
        confirmations: txDetails.confirmations || 0,
        blockHash: txDetails.blockhash || null
      };
      
    } catch (error) {
      this.logger.error(`Erro ao enviar pagamento Bitcoin: ${error.message}`, error);
      throw error;
    }
  }

  async estimateFee() {
    try {
      // Estimar taxa para confirmação em 6 blocos
      const feeEstimate = await this.rpcCall('estimatesmartfee', [6]);
      
      if (feeEstimate.feerate) {
        return feeEstimate.feerate;
      }
      
      // Fallback para taxa mínima se não conseguir estimar
      return 0.00001; // 1 sat/byte aproximadamente
      
    } catch (error) {
      this.logger.warn('Não foi possível estimar taxa, usando taxa mínima');
      return 0.00001;
    }
  }

  async getTransactionStatus(txid) {
    try {
      const tx = await this.rpcCall('gettransaction', [txid]);
      return {
        confirmations: tx.confirmations || 0,
        confirmed: (tx.confirmations || 0) >= 1,
        blockHash: tx.blockhash || null,
        blockTime: tx.blocktime || null
      };
    } catch (error) {
      this.logger.error(`Erro ao consultar status da transação ${txid}:`, error);
      throw error;
    }
  }

  async getNewAddress() {
    try {
      return await this.rpcCall('getnewaddress');
    } catch (error) {
      this.logger.error('Erro ao gerar novo endereço:', error);
      throw error;
    }
  }
}

module.exports = BitcoinRPC;
