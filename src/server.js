/**
 * SERVER.JS - Servidor HTTP Principal do Sistema de Pagamentos
 * 
 * Este arquivo implementa a API REST que serve como gateway para processamento
 * de pagamentos em múltiplas redes blockchain (Bitcoin, Lightning, Liquid).
 * 
 * FUNCIONALIDADES PRINCIPAIS:
 * - API REST para requisições de pagamento
 * - Autenticação por IP e chave secreta
 * - Consulta de saldos por rede
 * - Gerenciamento de webhooks
 * - Monitoramento de transações pendentes/enviadas
 * 
 * ENDPOINTS DISPONÍVEIS:
 * - POST /payment - Processar novos pagamentos
 * - GET /balance/:network - Consultar saldos
 * - GET /pending - Listar pagamentos pendentes
 * - GET /sent - Listar pagamentos enviados
 * - POST /webhook/test - Testar webhook
 * - GET /webhook/stats - Estatísticas de webhooks
 * - POST /webhook/retry-failed - Reprocessar webhooks falhados
 * 
 * SEGURANÇA:
 * - Whitelist de IPs permitidos
 * - Autenticação via header X-Secret-Key
 * - Logs detalhados de todas as operações
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const config = require('../config/config.json');
const PaymentProcessor = require('./payment-processor');

// ========== CONFIGURAÇÃO DO SISTEMA DE LOGS ==========
// Configurar logger estruturado com múltiplos transportes
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Log para arquivo - para persistência e análise posterior
    new winston.transports.File({ filename: config.logging.filename }),
    // Log para console - para desenvolvimento e debugging
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// ========== CONFIGURAÇÃO DO SERVIDOR EXPRESS ==========
const app = express();
// Middleware para parsing de JSON nas requisições
app.use(express.json());

// ========== MIDDLEWARE DE SEGURANÇA ==========
/**
 * Middleware de autenticação e autorização
 * 
 * Implementa dupla validação de segurança:
 * 1. Validação de IP - apenas IPs whitelist podem acessar
 * 2. Validação de chave secreta - header X-Secret-Key obrigatório
 * 
 * Casos especiais:
 * - IPs localhost (::1, 127.0.0.1) sempre permitidos para desenvolvimento
 * - Logs detalhados de tentativas de acesso não autorizadas
 */
app.use((req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  logger.info(`Requisição recebida de IP: ${clientIp}`);
  
  // ========== VALIDAÇÃO DE IP ==========
  // Verificar se o IP está na lista de IPs permitidos ou é localhost
  if (!config.server.allowedIps.includes(clientIp) && clientIp !== '::1' && clientIp !== '127.0.0.1') {
    logger.warn(`IP não autorizado: ${clientIp}`);
    return res.status(403).json({ error: 'IP não autorizado' });
  }
  
  // ========== VALIDAÇÃO DE CHAVE SECRETA ==========
  // Verificar se a chave secreta no header corresponde à configurada
  const secretKey = req.headers['x-secret-key'];
  if (secretKey !== config.server.secretKey) {
    logger.warn(`Chave secreta inválida de IP: ${clientIp}`);
    return res.status(401).json({ error: 'Chave secreta inválida' });
  }
  
  // Se passou nas validações, continuar para o próximo middleware
  next();
});

// ========== INICIALIZAÇÃO DO PROCESSADOR DE PAGAMENTOS ==========
// Instanciar o processador principal que coordena todas as operações
const paymentProcessor = new PaymentProcessor(logger);

// ========== ENDPOINT PRINCIPAL: PROCESSAR PAGAMENTOS ==========
/**
 * POST /payment - Endpoint principal para processamento de pagamentos
 * 
 * Recebe requisições de pagamento e coordena todo o fluxo:
 * 1. Validação de dados obrigatórios
 * 2. Validação de rede suportada  
 * 3. Validação de webhook (se fornecido)
 * 4. Criação de ID único para rastreamento
 * 5. Persistência da requisição em arquivo
 * 6. Processamento assíncrono do pagamento
 * 7. Retorno de confirmação com ID e hash da transação
 * 
 * DADOS OBRIGATÓRIOS:
 * - transactionId: ID único da transação no sistema cliente
 * - username: Usuário que solicitou o pagamento
 * - amount: Valor em satoshis
 * - network: Rede de destino (bitcoin/lightning/liquid)
 * - destinationWallet: Endereço/invoice de destino
 * 
 * DADOS OPCIONAIS:
 * - webhookUrl: URL para notificações de status
 * - webhookSecret: Chave para assinatura HMAC dos webhooks
 */
app.post('/payment', async (req, res) => {
  try {
    // ========== EXTRAÇÃO E VALIDAÇÃO DOS DADOS ==========
    const { 
      transactionId, 
      username, 
      amount, 
      network, 
      destinationWallet,
      webhookUrl,
      webhookSecret 
    } = req.body;
    
    // Validar dados obrigatórios
    if (!transactionId || !username || !amount || !network || !destinationWallet) {
      return res.status(400).json({ 
        error: 'Dados obrigatórios faltando',
        required: ['transactionId', 'username', 'amount', 'network', 'destinationWallet']
      });
    }
    
    // Validar rede suportada
    if (!['bitcoin', 'lightning', 'liquid'].includes(network.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Rede não suportada',
        supported: ['bitcoin', 'lightning', 'liquid']
      });
    }
    
    // Validar URL do webhook se fornecida
    if (webhookUrl && !paymentProcessor.webhookManager.validateWebhookUrl(webhookUrl)) {
      return res.status(400).json({ 
        error: 'URL de webhook inválida',
        message: 'A URL deve ser um endereço HTTP ou HTTPS válido'
      });
    }
    
    // ========== CRIAÇÃO DO OBJETO DE REQUISIÇÃO ==========
    // Criar objeto padronizado com ID único e timestamp
    const paymentRequest = {
      id: uuidv4(), // UUID v4 para garantir unicidade
      transactionId,
      username,
      amount: parseInt(amount), // Garantir que é um inteiro
      network: network.toLowerCase(),
      destinationWallet,
      webhookUrl: webhookUrl || null,
      webhookSecret: webhookSecret || null,
      timestamp: new Date().toISOString(),
      status: 'pending' // Status inicial
    };
    
    logger.info(`Nova requisição de pagamento: ${JSON.stringify(paymentRequest)}`);
    
    // ========== PERSISTÊNCIA DA REQUISIÇÃO ==========
    // Salvar requisição no diretório payment_req para rastreamento
    const filename = `${paymentRequest.id}_${transactionId}.json`;
    const filepath = path.join(__dirname, '../payment_req', filename);
    
    fs.writeFileSync(filepath, JSON.stringify(paymentRequest, null, 2));
    logger.info(`Requisição salva: ${filepath}`);
    
    // ========== PROCESSAMENTO DO PAGAMENTO ==========
    // Enviar para processamento assíncrono
    const result = await paymentProcessor.processPayment(paymentRequest);
    
    // ========== RESPOSTA DE SUCESSO ==========
    res.json({
      success: true,
      message: 'Pagamento processado com sucesso',
      paymentId: paymentRequest.id,
      transactionHash: result.transactionHash
    });
    
  } catch (error) {
    // ========== TRATAMENTO DE ERRO ==========
    logger.error(`Erro ao processar pagamento: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error.message 
    });
  }
});

// ========== ENDPOINT: CONSULTAR SALDOS ==========
/**
 * GET /balance/:network - Consulta saldos por rede específica
 * 
 * Permite consultar o saldo disponível em cada rede suportada:
 * - bitcoin: Saldo on-chain do Bitcoin
 * - lightning: Saldo dos canais Lightning Network
 * - liquid: Saldo na rede Liquid/Elements
 * - all: Todos os saldos simultaneamente
 * 
 * Útil para:
 * - Verificar disponibilidade antes de enviar pagamentos
 * - Monitoramento de liquidez
 * - Dashboards de administração
 */
app.get('/balance/:network', async (req, res) => {
  try {
    const { network } = req.params;
    
    // Validar rede suportada
    if (!['bitcoin', 'lightning', 'liquid', 'all'].includes(network.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Rede não suportada',
        supported: ['bitcoin', 'lightning', 'liquid', 'all']
      });
    }
    
    if (network.toLowerCase() === 'all') {
      // ========== CONSULTAR TODOS OS SALDOS ==========
      // Obter saldos de todas as redes em paralelo para melhor performance
      const allBalances = await paymentProcessor.getAllBalances();
      res.json({
        success: true,
        balances: allBalances
      });
    } else {
      // ========== CONSULTAR SALDO ESPECÍFICO ==========
      // Obter saldo de uma rede específica
      const balance = await paymentProcessor.getBalance(network.toLowerCase());
      res.json({
        success: true,
        network: network.toLowerCase(),
        balance
      });
    }
    
  } catch (error) {
    logger.error(`Erro ao consultar saldo: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao consultar saldo',
      message: error.message 
    });
  }
});

// ========== ENDPOINT: LISTAR TRANSAÇÕES PENDENTES ==========
/**
 * GET /pending - Lista todas as transações pendentes
 * 
 * Lê o diretório payment_req/ e retorna todas as requisições que ainda
 * não foram processadas. Inclui tanto requisições aguardando processamento
 * quanto aquelas que falharam (arquivos com prefixo ERROR_).
 * 
 * Útil para:
 * - Monitoramento de fila de processamento
 * - Debugging de transações presas
 * - Relatórios administrativos
 */
app.get('/pending', (req, res) => {
  try {
    const pendingDir = path.join(__dirname, '../payment_req');
    const files = fs.readdirSync(pendingDir);
    
    // Processar cada arquivo e extrair dados da requisição
    const pendingPayments = files.map(file => {
      const filepath = path.join(pendingDir, file);
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return {
        filename: file,
        ...data
      };
    });
    
    res.json({
      success: true,
      count: pendingPayments.length,
      payments: pendingPayments
    });
    
  } catch (error) {
    logger.error(`Erro ao listar pagamentos pendentes: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao listar pagamentos pendentes',
      message: error.message 
    });
  }
});

// Endpoint para listar transações enviadas
app.get('/sent', (req, res) => {
  try {
    const sentDir = path.join(__dirname, '../payment_sent');
    const files = fs.readdirSync(sentDir);
    
    const sentPayments = files.map(file => {
      const filepath = path.join(sentDir, file);
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return {
        filename: file,
        ...data
      };
    });
    
    res.json({
      success: true,
      count: sentPayments.length,
      payments: sentPayments
    });
    
  } catch (error) {
    logger.error(`Erro ao listar pagamentos enviados: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao listar pagamentos enviados',
      message: error.message 
    });
  }
});

// Endpoint para consultar todos os saldos
app.get('/balance/all', async (req, res) => {
  try {
    const allBalances = await paymentProcessor.getAllBalances();
    
    res.json({
      success: true,
      balances: allBalances
    });
    
  } catch (error) {
    logger.error(`Erro ao consultar todos os saldos: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao consultar saldos',
      message: error.message 
    });
  }
});

// Endpoint para testar webhook
app.post('/webhook/test', async (req, res) => {
  try {
    const { webhookUrl, webhookSecret } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ 
        error: 'URL de webhook é obrigatória',
        required: ['webhookUrl']
      });
    }
    
    // Validar URL do webhook
    if (!paymentProcessor.webhookManager.validateWebhookUrl(webhookUrl)) {
      return res.status(400).json({ 
        error: 'URL de webhook inválida',
        message: 'A URL deve ser um endereço HTTP ou HTTPS válido'
      });
    }
    
    logger.info(`Testando webhook: ${webhookUrl}`);
    
    const success = await paymentProcessor.webhookManager.sendTestWebhook(webhookUrl, webhookSecret);
    
    res.json({
      success: success,
      message: success ? 'Webhook de teste enviado com sucesso' : 'Falha ao enviar webhook de teste',
      webhookUrl: webhookUrl,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Erro ao testar webhook: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao testar webhook',
      message: error.message 
    });
  }
});

// Endpoint para obter estatísticas de webhook
app.get('/webhook/stats', (req, res) => {
  try {
    const stats = paymentProcessor.webhookManager.getWebhookStats();
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    logger.error(`Erro ao obter estatísticas de webhook: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao obter estatísticas de webhook',
      message: error.message 
    });
  }
});

// Endpoint para reprocessar webhooks falhados
app.post('/webhook/retry-failed', async (req, res) => {
  try {
    logger.info('Iniciando reprocessamento de webhooks falhados');
    
    await paymentProcessor.webhookManager.reprocessFailedWebhooks();
    
    res.json({
      success: true,
      message: 'Reprocessamento de webhooks falhados concluído',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Erro ao reprocessar webhooks: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao reprocessar webhooks',
      message: error.message 
    });
  }
});

// Endpoint original para consultar todos os saldos (manter compatibilidade)
app.get('/balance/all', async (req, res) => {
  try {
    const allBalances = await paymentProcessor.getAllBalances();
    
    res.json({
      success: true,
      balances: allBalances
    });
    
  } catch (error) {
    logger.error(`Erro ao consultar todos os saldos: ${error.message}`, error);
    res.status(500).json({ 
      error: 'Erro ao consultar saldos',
      message: error.message 
    });
  }
});

// Iniciar servidor
app.listen(config.server.port, () => {
  logger.info(`Servidor iniciado na porta ${config.server.port}`);
  console.log(`🚀 Servidor rodando na porta ${config.server.port}`);
  console.log(`📝 Logs sendo salvos em: ${config.logging.filename}`);
  console.log(`🔑 IPs permitidos: ${config.server.allowedIps.join(', ')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Servidor sendo encerrado...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Servidor sendo encerrado...');
  process.exit(0);
});
