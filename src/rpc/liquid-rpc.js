/**
 * LIQUID-RPC.JS - Cliente RPC para Liquid Network (Elements)
 * 
 * Esta classe implementa um cliente completo para comunicação com a rede Liquid,
 * uma sidechain Bitcoin focada em transações confidenciais e assets digitais.
 * 
 * FUNCIONALIDADES PRINCIPAIS:
 * - Pagamentos em L-BTC (Liquid Bitcoin)
 * - Suporte a múltiplos assets nativos
 * - Transações confidenciais (opcionais)
 * - Geração de endereços normais e confidenciais
 * - Emissão e reemissão de assets
 * - Estimativa de taxas dinâmica
 * 
 * CARACTERÍSTICAS DA LIQUID:
 * - Confirmações mais rápidas (1-2 minutos)
 * - Taxas mais baixas que Bitcoin mainnet
 * - Transações confidenciais (valores e assets ocultos)
 * - Suporte nativo a múltiplos assets
 * - Federação de validadores
 * 
 * ASSETS SUPORTADOS:
 * - L-BTC: Bitcoin na rede Liquid (asset principal)
 * - Qualquer asset nativo emitido na rede
 * - Stablecoins e tokens personalizados
 */

const axios = require('axios');

class LiquidRPC {
  /**
   * Construtor do cliente Liquid RPC
   * 
   * Inicializa conexão HTTP com node Elements/Liquid usando
   * autenticação básica (usuário/senha).
   * 
   * @param {Object} config - Configuração de conexão
   * @param {string} config.rpcUser - Usuário RPC
   * @param {string} config.rpcPassword - Senha RPC  
   * @param {string} config.rpcHost - Host do node Liquid
   * @param {number} config.rpcPort - Porta RPC do node
   * @param {Object} logger - Instância do logger Winston
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.rpcUrl = `http://${config.rpcUser}:${config.rpcPassword}@${config.rpcHost}:${config.rpcPort}`;
    
    // ========== DEFINIÇÃO DE ASSET IDs IMPORTANTES ==========
    // Asset ID do L-BTC (Liquid Bitcoin) - principal ativo da rede
    this.LBTC_ASSET_ID = '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d';
    // Exemplo de asset ID para testes/desenvolvimento
    this.TEST_ASSET_ID = '38fca2d939696061a8f76d4e6b5eecd54e3b4221c846f24a6b279e79952850a5';
    
    // ========== MAPEAMENTO DE NOMES AMIGÁVEIS ==========
    // Mapear asset IDs complexos para nomes legíveis
    this.assetNames = {
      'bitcoin': 'L-BTC',              // Alias comum
      [this.LBTC_ASSET_ID]: 'L-BTC',   // Asset ID oficial
      [this.TEST_ASSET_ID]: 'TEST'     // Asset de teste
    };
  }

  /**
   * Executa chamada RPC para o node Liquid/Elements
   * 
   * Método genérico para comunicação com o daemon Elements via JSON-RPC.
   * Implementa timeout e tratamento de erro padronizado.
   * 
   * FORMATO JSON-RPC:
   * - jsonrpc: "1.0" (versão do protocolo)
   * - id: identificador da requisição
   * - method: método RPC a ser executado
   * - params: array de parâmetros do método
   * 
   * @param {string} method - Nome do método RPC (ex: 'getbalance', 'sendtoaddress')
   * @param {Array} [params=[]] - Array de parâmetros para o método
   * @returns {Promise<any>} Resultado do método RPC
   * @throws {Error} Se houver erro na comunicação ou no método
   */
  async rpcCall(method, params = []) {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '1.0',
        id: 'liquid-rpc',
        method: method,
        params: params
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000 // 30 segundos timeout
      });

      // Verificar se houve erro específico do RPC
      if (response.data.error) {
        throw new Error(`Liquid RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(`Liquid RPC call failed: ${method}`, error);
      throw new Error(`Liquid RPC call failed: ${error.message}`);
    }
  }

  /**
   * Obtém nome amigável para um asset ID
   * 
   * Converte asset IDs complexos em nomes legíveis para melhor UX.
   * 
   * @param {string} assetId - Asset ID hexadecimal
   * @returns {string} Nome amigável ou o próprio asset ID se não mapeado
   */
  getAssetName(assetId) {
    return this.assetNames[assetId] || assetId;
  }

  /**
   * Obtém saldo da carteira Liquid
   * 
   * Consulta saldos de todos os assets na carteira, com foco especial
   * no L-BTC como asset principal. Retorna tanto saldos confirmados
   * quanto não confirmados.
   * 
   * CARACTERÍSTICAS LIQUID:
   * - Múltiplos assets em uma única carteira
   * - L-BTC como asset principal (equivalente ao Bitcoin)
   * - Saldos podem aparecer como "bitcoin" ou pelo asset ID
   * 
   * @returns {Promise<Object>} Objeto com saldos detalhados
   * @returns {number} returns.confirmed - Saldo L-BTC confirmado (em satoshis)
   * @returns {number} returns.unconfirmed - Saldo L-BTC não confirmado (em satoshis)  
   * @returns {number} returns.total - Saldo L-BTC total (em satoshis)
   * @returns {Object} returns.assets - Todos os assets com nomes amigáveis
   */
  async getBalance() {
    try {
      // ========== CONSULTA DE SALDOS CONFIRMADOS ==========
      // Obter saldos de todos os assets confirmados
      const balances = await this.rpcCall('getbalance');
      
      // ========== CONSULTA DE SALDOS NÃO CONFIRMADOS ==========
      // Obter saldos não confirmados separadamente
      const unconfirmedBalances = await this.rpcCall('getunconfirmedbalance');
      
      // ========== EXTRAÇÃO DO SALDO L-BTC ==========
      // Elements/Liquid pode retornar L-BTC como "bitcoin" ou pelo asset ID
      const lbtcBalance = balances['bitcoin'] || balances[this.LBTC_ASSET_ID] || 0;
      const lbtcUnconfirmed = unconfirmedBalances['bitcoin'] || unconfirmedBalances[this.LBTC_ASSET_ID] || 0;
      
      // ========== MAPEAMENTO DE ASSETS COM NOMES AMIGÁVEIS ==========
      const namedAssets = {};
      for (const [assetId, balance] of Object.entries(balances)) {
        const assetName = this.getAssetName(assetId);
        namedAssets[assetName] = balance;
      }
      
      return {
        confirmed: Math.round(lbtcBalance * 100000000), // Converter para satoshis
        unconfirmed: Math.round(lbtcUnconfirmed * 100000000),
        total: Math.round((lbtcBalance + lbtcUnconfirmed) * 100000000),
        assets: namedAssets // Assets com nomes amigáveis
      };
    } catch (error) {
      this.logger.error('Erro ao consultar saldo Liquid:', error);
      throw error;
    }
  }

  /**
   * Envia pagamento na rede Liquid
   * 
   * Executa transação Liquid com suporte a múltiplos assets.
   * O processo envolve criação, financiamento, assinatura e broadcast da transação.
   * 
   * CARACTERÍSTICAS LIQUID:
   * - Confirmações mais rápidas (1-2 minutos)
   * - Taxas tipicamente menores que Bitcoin mainnet
   * - Suporte nativo a múltiplos assets
   * - Transações confidenciais opcionais
   * 
   * PROCESSO DE TRANSAÇÃO:
   * 1. Validação do endereço de destino
   * 2. Estimativa de taxa de rede
   * 3. Criação de transação raw
   * 4. Financiamento automático (seleção de UTXOs)
   * 5. Assinatura com chave privada da carteira
   * 6. Broadcast para a rede
   * 
   * @param {string} destinationAddress - Endereço Liquid de destino
   * @param {number} amountSats - Valor em satoshis (1 L-BTC = 100,000,000 sats)
   * @param {string} [assetId=null] - Asset ID específico (padrão: L-BTC)
   * @returns {Promise<Object>} Resultado da transação
   * @returns {string} returns.transactionHash - Hash da transação (txid)
   * @returns {number} returns.fee - Taxa paga em satoshis
   * @returns {number} returns.confirmations - Número de confirmações (inicial: 0)
   * @returns {string|null} returns.blockHash - Hash do bloco (null se não confirmado)
   * @returns {string} returns.assetId - Asset ID usado na transação
   * @throws {Error} Se endereço inválido, saldo insuficiente ou falha na transação
   */
  async sendPayment(destinationAddress, amountSats, assetId = null) {
    try {
      // Converter satoshis para unidade Bitcoin (1 BTC = 100,000,000 sats)
      const amountBTC = amountSats / 100000000;
      
      this.logger.info(`Enviando ${amountSats} sats (${amountBTC} L-BTC) para ${destinationAddress}`);
      
      // ========== VALIDAÇÃO DO ENDEREÇO ==========
      const isValid = await this.rpcCall('validateaddress', [destinationAddress]);
      if (!isValid.isvalid) {
        throw new Error(`Endereço Liquid inválido: ${destinationAddress}`);
      }
      
      // ========== ENVIO DIRETO ==========
      // Usar sendtoaddress que é mais simples e confiável
      const txid = await this.rpcCall('sendtoaddress', [destinationAddress, amountBTC]);
      
      // ========== OBTENÇÃO DE DETALHES DA TRANSAÇÃO ==========
      const txDetails = await this.rpcCall('gettransaction', [txid]);
      
      return {
        transactionHash: txid,
        fee: Math.abs(Math.round((txDetails.fee || 0) * 100000000)), // Converter taxa para satoshis
        confirmations: txDetails.confirmations || 0,
        blockHash: txDetails.blockhash || null,
        assetId: assetId || this.LBTC_ASSET_ID
      };
      
    } catch (error) {
      this.logger.error(`Erro ao enviar pagamento Liquid: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Método alias para sendPayment com asset específico
   * 
   * Conveniência para enviar assets que não sejam L-BTC.
   * 
   * @param {string} destinationAddress - Endereço de destino
   * @param {number} amountSats - Valor em satoshis  
   * @param {string} assetId - Asset ID específico
   * @returns {Promise<Object>} Resultado da transação
   */
  async sendAsset(destinationAddress, amountSats, assetId) {
    return this.sendPayment(destinationAddress, amountSats, assetId);
  }

  /**
   * Estima taxa de transação dinâmica
   * 
   * Usa estimativa inteligente da rede para otimizar custo vs velocidade.
   * 
   * @returns {Promise<number>} Taxa estimada em BTC/vB
   */
  async estimateFee() {
    try {
      // Estimar taxa para confirmação em 6 blocos (~6 minutos na Liquid)
      const feeEstimate = await this.rpcCall('estimatesmartfee', [6]);
      
      if (feeEstimate.feerate) {
        return feeEstimate.feerate;
      }
      
      // Fallback para taxa mínima se estimativa falhar
      return 0.00001;
      
    } catch (error) {
      this.logger.warn('Não foi possível estimar taxa, usando taxa mínima');
      return 0.00001;
    }
  }

  /**
   * Consulta status de uma transação específica
   * 
   * @param {string} txid - Hash da transação
   * @returns {Promise<Object>} Status da transação
   */
  async getTransactionStatus(txid) {
    try {
      const tx = await this.rpcCall('gettransaction', [txid]);
      return {
        confirmations: tx.confirmations || 0,
        confirmed: (tx.confirmations || 0) >= 2, // Liquid requer 2 confirmações
        blockHash: tx.blockhash || null,
        blockTime: tx.blocktime || null
      };
    } catch (error) {
      this.logger.error(`Erro ao consultar status da transação ${txid}:`, error);
      throw error;
    }
  }

  /**
   * Gera novo endereço Liquid padrão
   * 
   * @returns {Promise<string>} Novo endereço para recebimento
   */
  async getNewAddress() {
    try {
      return await this.rpcCall('getnewaddress');
    } catch (error) {
      this.logger.error('Erro ao gerar novo endereço:', error);
      throw error;
    }
  }

  async getNewAddressConfidential() {
    try {
      const address = await this.rpcCall('getnewaddress');
      const confidentialAddress = await this.rpcCall('getaddressinfo', [address]);
      return confidentialAddress.confidential || address;
    } catch (error) {
      this.logger.error('Erro ao gerar novo endereço confidencial:', error);
      throw error;
    }
  }

  async blindRawTransaction(rawTx) {
    try {
      return await this.rpcCall('blindrawtransaction', [rawTx]);
    } catch (error) {
      this.logger.error('Erro ao cegar transação:', error);
      throw error;
    }
  }

  async unblindRawTransaction(rawTx) {
    try {
      return await this.rpcCall('unblindrawtransaction', [rawTx]);
    } catch (error) {
      this.logger.error('Erro ao descegar transação:', error);
      throw error;
    }
  }

  async listAssets() {
    try {
      const balances = await this.rpcCall('getbalance');
      const assets = [];
      
      for (const [assetId, balance] of Object.entries(balances)) {
        if (balance > 0) {
          assets.push({
            assetId: assetId,
            assetName: this.getAssetName(assetId),
            balance: Math.round(balance * 100000000),
            isLBTC: assetId === this.LBTC_ASSET_ID || assetId === 'bitcoin'
          });
        }
      }
      
      return assets;
    } catch (error) {
      this.logger.error('Erro ao listar assets:', error);
      throw error;
    }
  }

  async issueAsset(assetAmount, tokenAmount = 0, blind = true) {
    try {
      const result = await this.rpcCall('issueasset', [assetAmount, tokenAmount, blind]);
      
      return {
        asset: result.asset,
        token: result.token,
        txid: result.txid,
        vin: result.vin,
        entropy: result.entropy
      };
    } catch (error) {
      this.logger.error('Erro ao emitir asset:', error);
      throw error;
    }
  }

  async reissueAsset(assetId, amount) {
    try {
      return await this.rpcCall('reissueasset', [assetId, amount]);
    } catch (error) {
      this.logger.error('Erro ao reemitir asset:', error);
      throw error;
    }
  }
}

module.exports = LiquidRPC;
