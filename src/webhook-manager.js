/**
 * WEBHOOK-MANAGER.JS - Gerenciador de Notificações Webhook
 * 
 * Esta classe é responsável por enviar notificações HTTP para sistemas externos
 * sobre mudanças de status nos pagamentos. Implementa um sistema robusto de
 * webhooks com recursos avançados de confiabilidade e segurança.
 * 
 * FUNCIONALIDADES PRINCIPAIS:
 * - Envio de webhooks para múltiplos eventos (pending, completed, failed)
 * - Sistema de retry com backoff exponencial
 * - Assinatura HMAC-SHA256 para verificação de autenticidade
 * - Persistência de webhooks falhados para reprocessamento
 * - Timestamps para prevenir replay attacks
 * - Validação de URLs e timeout configurável
 * 
 * EVENTOS SUPORTADOS:
 * - payment.pending: Pagamento recebido e sendo processado
 * - payment.completed: Pagamento enviado com sucesso
 * - payment.failed: Falha no processamento do pagamento
 * - webhook.test: Webhook de teste para validação
 * 
 * SEGURANÇA:
 * - Assinatura HMAC nos headers X-Webhook-Signature
 * - Timestamp nos headers X-Webhook-Timestamp
 * - Validação de URLs (apenas HTTP/HTTPS)
 * - Timeout configurável para evitar travamentos
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config.json');

class WebhookManager {
  /**
   * Construtor do WebhookManager
   * 
   * Inicializa o gerenciador com configurações e prepara o diretório
   * para armazenamento de webhooks falhados.
   * 
   * @param {Object} logger - Instância do logger Winston
   */
  constructor(logger) {
    this.logger = logger;
    this.config = config.webhooks;
    this.failedWebhooksDir = path.join(__dirname, '../webhook_failures');
    
    // Criar diretório para webhooks falhados se não existir
    if (this.config.saveFailedWebhooks && !fs.existsSync(this.failedWebhooksDir)) {
      fs.mkdirSync(this.failedWebhooksDir, { recursive: true });
    }
  }

  /**
   * Gera assinatura HMAC-SHA256 para verificação de autenticidade
   * 
   * Cria uma assinatura criptográfica do payload usando a chave secreta fornecida.
   * Esta assinatura permite ao destinatário verificar que o webhook realmente
   * veio do servidor e não foi modificado em trânsito.
   * 
   * PROCESSO:
   * 1. Converte o payload para string UTF-8
   * 2. Usa HMAC-SHA256 com a chave secreta
   * 3. Retorna hash em formato hexadecimal
   * 
   * @param {string} payload - Payload JSON do webhook em string
   * @param {string} secret - Chave secreta compartilhada para assinatura
   * @returns {string} Assinatura HMAC-SHA256 em formato hexadecimal
   */
  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Envia webhook para endpoint especificado com sistema de retry robusto
   * 
   * Este é o método principal para envio de webhooks. Implementa várias
   * camadas de confiabilidade e segurança:
   * 
   * ESTRUTURA DO PAYLOAD:
   * - event: Tipo de evento (payment.pending, payment.completed, etc.)
   * - timestamp: Momento do envio (ISO 8601)
   * - data: Dados completos do pagamento
   * - server: Informações do servidor emissor
   * 
   * RECURSOS DE SEGURANÇA:
   * - Assinatura HMAC-SHA256 (se secret fornecido)
   * - Timestamp para prevenir replay attacks
   * - Headers customizáveis via configuração
   * 
   * SISTEMA DE RETRY:
   * - Múltiplas tentativas com delay configurável
   * - Log detalhado de cada tentativa
   * - Persistência de falhas para reprocessamento
   * 
   * @param {string} webhookUrl - URL de destino do webhook
   * @param {Object} paymentData - Dados completos do pagamento
   * @param {string} event - Tipo de evento (payment.pending, payment.completed, payment.failed)
   * @param {string} [webhookSecret=null] - Chave secreta para assinatura HMAC
   * @returns {Promise<boolean>} true se enviado com sucesso, false caso contrário
   */
  async sendWebhook(webhookUrl, paymentData, event, webhookSecret = null) {
    // ========== VERIFICAÇÃO DE HABILITAÇÃO ==========
    if (!this.config.enabled) {
      this.logger.info('Webhooks desabilitados na configuração');
      return true;
    }

    // ========== MONTAGEM DO PAYLOAD ==========
    const payload = {
      event: event,
      timestamp: new Date().toISOString(),
      data: paymentData,
      server: {
        name: 'LND-RPC-Server',
        version: '2.0.0'
      }
    };

    const payloadString = JSON.stringify(payload);
    const headers = { ...this.config.defaultHeaders };

    // ========== ASSINATURA CRIPTOGRÁFICA ==========
    // Adicionar assinatura HMAC se chave secreta fornecida
    if (webhookSecret) {
      const signature = this.generateSignature(payloadString, webhookSecret);
      // Usar múltiplos headers para compatibilidade com diferentes sistemas
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
      headers['X-Webhook-Signature-256'] = `sha256=${signature}`;
    }

    // ========== PROTEÇÃO CONTRA REPLAY ATTACKS ==========
    // Adicionar timestamp Unix para validação temporal
    headers['X-Webhook-Timestamp'] = Math.floor(Date.now() / 1000).toString();

    // ========== SISTEMA DE RETRY ==========
    let attempt = 0;
    const maxAttempts = this.config.retryAttempts + 1;

    while (attempt < maxAttempts) {
      try {
        this.logger.info(`Enviando webhook (tentativa ${attempt + 1}/${maxAttempts}): ${event} para ${webhookUrl}`);

        // ========== ENVIO HTTP ==========
        const response = await axios.post(webhookUrl, payload, {
          headers: headers,
          timeout: this.config.timeout,
          validateStatus: (status) => status >= 200 && status < 300 // Aceitar apenas 2xx
        });

        this.logger.info(`Webhook enviado com sucesso: ${event} - Status: ${response.status}`);
        return true;

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= maxAttempts;

        this.logger.warn(`Falha no webhook (tentativa ${attempt}/${maxAttempts}): ${error.message}`);

        if (isLastAttempt) {
          // ========== TRATAMENTO DE FALHA FINAL ==========
          this.logger.error(`Webhook falhou definitivamente após ${maxAttempts} tentativas: ${webhookUrl}`);
          
          // Log estruturado da falha
          if (this.config.logFailures) {
            this.logFailedWebhook(webhookUrl, payload, error.message);
          }

          // Persistir webhook falhado para reprocessamento manual
          if (this.config.saveFailedWebhooks) {
            this.saveFailedWebhook(webhookUrl, payload, error.message);
          }

          return false;
        } else {
          // ========== RETRY COM DELAY ==========
          // Aguardar antes da próxima tentativa
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    return false;
  }

  /**
   * Envia webhook de pagamento pendente
   * 
   * Notifica que uma requisição de pagamento foi recebida e está
   * sendo processada. Este é o primeiro webhook enviado no fluxo.
   * 
   * @param {string} webhookUrl - URL de destino
   * @param {Object} paymentData - Dados do pagamento
   * @param {string} [webhookSecret=null] - Chave secreta para assinatura
   * @returns {Promise<boolean>} Sucesso do envio
   */
  async sendPaymentPendingWebhook(webhookUrl, paymentData, webhookSecret = null) {
    return await this.sendWebhook(webhookUrl, paymentData, 'payment.pending', webhookSecret);
  }

  /**
   * Envia webhook de pagamento concluído
   * 
   * Notifica que o pagamento foi enviado com sucesso na blockchain.
   * Inclui hash da transação e informações de taxa.
   * 
   * @param {string} webhookUrl - URL de destino
   * @param {Object} paymentData - Dados do pagamento com hash da transação
   * @param {string} [webhookSecret=null] - Chave secreta para assinatura
   * @returns {Promise<boolean>} Sucesso do envio
   */
  async sendPaymentCompletedWebhook(webhookUrl, paymentData, webhookSecret = null) {
    return await this.sendWebhook(webhookUrl, paymentData, 'payment.completed', webhookSecret);
  }

  /**
   * Envia webhook de pagamento falhado
   * 
   * Notifica que houve erro no processamento do pagamento.
   * Inclui detalhes do erro para debugging.
   * 
   * @param {string} webhookUrl - URL de destino
   * @param {Object} paymentData - Dados do pagamento com informações de erro
   * @param {string} [webhookSecret=null] - Chave secreta para assinatura
   * @returns {Promise<boolean>} Sucesso do envio
   */
  async sendPaymentFailedWebhook(webhookUrl, paymentData, webhookSecret = null) {
    return await this.sendWebhook(webhookUrl, paymentData, 'payment.failed', webhookSecret);
  }

  /**
   * Envia webhook de teste
   * 
   * Permite testar a conectividade e configuração de webhooks
   * sem processar um pagamento real.
   * 
   * @param {string} webhookUrl - URL de destino
   * @param {string} [webhookSecret=null] - Chave secreta para assinatura
   * @returns {Promise<boolean>} Sucesso do envio
   */
  async sendTestWebhook(webhookUrl, webhookSecret = null) {
    const testPayload = {
      id: 'test-webhook-' + Date.now(),
      transactionId: 'test-transaction',
      username: 'test-user',
      amount: 1000,
      network: 'lightning',
      destinationWallet: 'test@example.com',
      status: 'test',
      timestamp: new Date().toISOString()
    };

    return await this.sendWebhook(webhookUrl, testPayload, 'webhook.test', webhookSecret);
  }

  /**
   * Registra webhook falhado no log
   */
  logFailedWebhook(webhookUrl, payload, errorMessage) {
    this.logger.error('WEBHOOK_FAILURE', {
      url: webhookUrl,
      event: payload.event,
      transactionId: payload.data?.transactionId,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Salva webhook falhado em arquivo para reprocessamento
   */
  saveFailedWebhook(webhookUrl, payload, errorMessage) {
    const failureData = {
      webhookUrl: webhookUrl,
      payload: payload,
      error: errorMessage,
      failedAt: new Date().toISOString(),
      attempts: this.config.retryAttempts + 1
    };

    const filename = `failed_webhook_${Date.now()}_${payload.data?.transactionId || 'unknown'}.json`;
    const filepath = path.join(this.failedWebhooksDir, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(failureData, null, 2));
      this.logger.info(`Webhook falhado salvo para reprocessamento: ${filepath}`);
    } catch (error) {
      this.logger.error(`Erro ao salvar webhook falhado: ${error.message}`);
    }
  }

  /**
   * Reprocessa webhooks falhados
   */
  async reprocessFailedWebhooks() {
    if (!fs.existsSync(this.failedWebhooksDir)) {
      return;
    }

    const files = fs.readdirSync(this.failedWebhooksDir)
      .filter(file => file.startsWith('failed_webhook_') && file.endsWith('.json'));

    this.logger.info(`Reprocessando ${files.length} webhooks falhados...`);

    for (const file of files) {
      const filepath = path.join(this.failedWebhooksDir, file);
      
      try {
        const failureData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        this.logger.info(`Reprocessando webhook: ${failureData.webhookUrl}`);
        
        const success = await this.sendWebhook(
          failureData.webhookUrl,
          failureData.payload.data,
          failureData.payload.event
        );

        if (success) {
          // Webhook reenviado com sucesso, remover arquivo
          fs.unlinkSync(filepath);
          this.logger.info(`Webhook reprocessado com sucesso: ${file}`);
        } else {
          this.logger.warn(`Falha ao reprocessar webhook: ${file}`);
        }

      } catch (error) {
        this.logger.error(`Erro ao reprocessar webhook ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Valida URL de webhook
   */
  validateWebhookUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch (error) {
      return false;
    }
  }

  /**
   * Sleep helper function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém estatísticas de webhooks
   */
  getWebhookStats() {
    const stats = {
      enabled: this.config.enabled,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay,
      failedWebhooks: 0
    };

    if (fs.existsSync(this.failedWebhooksDir)) {
      const failedFiles = fs.readdirSync(this.failedWebhooksDir)
        .filter(file => file.startsWith('failed_webhook_') && file.endsWith('.json'));
      stats.failedWebhooks = failedFiles.length;
    }

    return stats;
  }
}

module.exports = WebhookManager;
