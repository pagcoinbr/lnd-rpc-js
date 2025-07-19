# Guia de Desenvolvimento - Servidor de Pagamentos Multi-Chain

Este documento explica como o projeto foi construído do zero e ensina conceitos fundamentais para criar servidores similares.

## 📚 Conceitos Fundamentais

### 🌐 HTTP vs gRPC - Entendendo as Diferenças

#### **HTTP/REST (usado no nosso servidor web)**
```
Cliente → HTTP POST → Servidor → Resposta JSON
```
- **Formato**: JSON (texto legível)
- **Protocolo**: HTTP/HTTPS
- **Uso**: Comunicação web, APIs públicas
- **Exemplo**: `POST /payment` com dados JSON

#### **gRPC (usado para comunicar com nós Bitcoin)**
```
Cliente → gRPC → Nó Bitcoin/Lightning → Resposta binária
```
- **Formato**: Protocol Buffers (binário, mais rápido)
- **Protocolo**: HTTP/2 + TLS
- **Uso**: Comunicação entre serviços internos
- **Exemplo**: Chamadas RPC para Bitcoin Core

### 🔗 Arquitetura do Projeto

```
┌─────────────────┐    HTTP/JSON    ┌─────────────────┐
│   Cliente Web   │ ───────────────→ │  Nosso Servidor │
│  (Python, etc)  │ ←─────────────── │   (Node.js)     │
└─────────────────┘                 └─────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
            │  Bitcoin Core   │      │      LND        │      │ Elements Core   │
            │   (RPC/HTTP)    │      │    (gRPC)       │      │   (RPC/HTTP)    │
            └─────────────────┘      └─────────────────┘      └─────────────────┘
```

## 🛠️ Ferramentas e Tecnologias Utilizadas

### **Node.js e Dependências**

```json
{
  "express": "^4.18.2",        // Servidor HTTP
  "@grpc/grpc-js": "^1.9.0",   // Cliente gRPC
  "@grpc/proto-loader": "^0.7.8", // Carregador de .proto
  "axios": "^1.5.0",          // Cliente HTTP para RPC
  "fs-extra": "^11.1.1",      // Manipulação de arquivos
  "winston": "^3.10.0"        // Sistema de logs
}
```

### **Por que cada ferramenta?**

- **Express**: Framework web simples para criar APIs HTTP
- **gRPC**: Comunicação eficiente com Lightning Network (LND)
- **Axios**: Fazer chamadas HTTP para Bitcoin Core e Elements
- **Winston**: Registrar todas as operações em arquivos de log
- **fs-extra**: Gerenciar arquivos de pagamentos de forma segura

## 🏗️ Construção Passo a Passo

### **Passo 1: Estrutura Base**

Primeiro, criamos a estrutura de diretórios:

```bash
mkdir lnd-rpc-py
cd lnd-rpc-py
npm init -y
```

### **Passo 2: Servidor HTTP Principal (`src/server.js`)**

```javascript
// Conceitos básicos de um servidor HTTP
const express = require('express');
const app = express();

// Middleware para interpretar JSON
app.use(express.json());

// Rota principal - recebe pagamentos
app.post('/payment', (req, res) => {
    // 1. Validar dados
    // 2. Salvar em payment_req/
    // 3. Processar pagamento
    // 4. Retornar resposta
});

// Iniciar servidor na porta 5002
app.listen(5002, () => {
    console.log('Servidor rodando na porta 5002');
});
```

### **Passo 3: Sistema de Autenticação**

```javascript
// Middleware de autenticação
function authenticateRequest(req, res, next) {
    const secretKey = req.headers['x-secret-key'];
    const validKey = config.server.secretKey;
    
    if (secretKey !== validKey) {
        return res.status(403).json({ error: 'Chave inválida' });
    }
    
    next(); // Continua para próximo middleware
}

// Aplicar autenticação em todas as rotas protegidas
app.use('/payment', authenticateRequest);
app.use('/balance', authenticateRequest);
```

### **Passo 4: Clientes RPC**

#### **Bitcoin/Liquid RPC (HTTP)**
```javascript
// Comunicação tradicional RPC via HTTP
const axios = require('axios');

async function bitcoinRPC(method, params) {
    const response = await axios.post(`http://${host}:${port}`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,      // Ex: 'sendtoaddress'
        params: params       // Ex: ['endereço', 0.001]
    }, {
        auth: {
            username: rpcUser,
            password: rpcPassword
        }
    });
    
    return response.data.result;
}
```

#### **Lightning gRPC**
```javascript
// Comunicação moderna via gRPC
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Carregar definições do arquivo .proto
const packageDefinition = protoLoader.loadSync('lightning.proto');
const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc;

// Criar cliente autenticado
const lightning = new lnrpc.Lightning('localhost:10009', credentials);

// Fazer chamadas assíncronas
lightning.sendPaymentSync(paymentRequest, (error, response) => {
    if (error) {
        console.error('Erro:', error);
    } else {
        console.log('Pagamento enviado:', response);
    }
});
```

### **Passo 5: Processamento de Pagamentos**

```javascript
// Fluxo completo de processamento
async function processPayment(paymentData) {
    try {
        // 1. Detectar tipo de rede
        const network = detectNetwork(paymentData.network, paymentData.destinationWallet);
        
        // 2. Escolher cliente RPC apropriado
        let result;
        switch(network) {
            case 'bitcoin':
                result = await bitcoinRPC.sendToAddress(destination, amount);
                break;
            case 'lightning':
                result = await lightningClient.sendPayment(invoice);
                break;
            case 'liquid':
                result = await liquidRPC.sendToAddress(destination, amount);
                break;
        }
        
        // 3. Mover arquivo de pending para sent
        await movePaymentFile(paymentData.transactionId, result.txid);
        
        return result;
    } catch (error) {
        logger.error('Erro no processamento:', error);
        throw error;
    }
}
```

## 🎓 Conceitos de JavaScript Utilizados

### **1. Async/Await**
```javascript
// Ao invés de callbacks aninhados (callback hell)
async function exemploModerno() {
    try {
        const saldo = await getRpcBalance();
        const resultado = await processarPagamento(saldo);
        return resultado;
    } catch (error) {
        console.error(error);
    }
}
```

### **2. Modules (require/module.exports)**
```javascript
// Organizar código em módulos
// arquivo: bitcoin-rpc.js
module.exports = {
    getBalance: async () => { /* ... */ },
    sendPayment: async (address, amount) => { /* ... */ }
};

// arquivo: server.js
const bitcoinRPC = require('./rpc/bitcoin-rpc');
```

### **3. Error Handling**
```javascript
// Tratamento robusto de erros
try {
    const result = await operacaoArriscada();
} catch (error) {
    if (error.code === 'ECONNREFUSED') {
        console.error('Nó não está rodando');
    } else {
        console.error('Erro desconhecido:', error.message);
    }
}
```

### **4. Object Destructuring**
```javascript
// Extrair dados de objetos facilmente
const { transactionId, amount, network } = req.body;

// Ao invés de:
// const transactionId = req.body.transactionId;
// const amount = req.body.amount;
```

## 🔧 Scripts Shell - Automatização

### **start.sh - Script de Inicialização**
```bash
#!/bin/bash

# Verificar dependências
if ! command -v node &> /dev/null; then
    echo "Node.js não encontrado"
    exit 1
fi

# Instalar dependências
npm install

# Verificar conectividade
check_port() {
    timeout 3 bash -c "</dev/tcp/$1/$2"
}

# Iniciar servidor
node src/server.js
```

### **test.sh - Script de Testes**
```bash
#!/bin/bash

# Função para fazer requisições
make_request() {
    curl -s -H "x-secret-key: $SECRET_KEY" \
         -H "Content-Type: application/json" \
         -X POST -d "$2" \
         "http://localhost:5002$1"
}

# Testar endpoints
make_request "/balance/bitcoin"
make_request "/payment" '{"amount": 1000, "network": "lightning"}'
```

## 📁 Organização de Arquivos

### **Separação de Responsabilidades**

```
src/
├── server.js           # Servidor HTTP principal
├── payment-processor.js # Lógica de processamento
└── rpc/
    ├── bitcoin-rpc.js  # Cliente Bitcoin
    ├── lightning-rpc.js # Cliente Lightning  
    └── liquid-rpc.js   # Cliente Liquid
```

**Por quê separar?**
- **Manutenibilidade**: Cada arquivo tem uma responsabilidade
- **Testabilidade**: Fácil testar cada módulo isoladamente
- **Reutilização**: Módulos podem ser usados em outros projetos

## 🚀 Próximos Passos para Aprender

### **1. Para Iniciantes**
- Aprender JavaScript básico (variáveis, funções, promises)
- Entender HTTP (métodos, status codes, headers)
- Praticar com Express.js simples

### **2. Para Intermediários**
- Estudar gRPC e Protocol Buffers
- Aprender sobre autenticação e segurança
- Praticar com diferentes APIs (REST, GraphQL)

### **3. Para Avançados**
- Implementar testes automatizados
- Adicionar monitoramento e métricas
- Estudar microserviços e escalabilidade

## 🔍 Recursos de Estudo

### **Documentação Oficial**
- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/guide/)
- [gRPC Documentation](https://grpc.io/docs/)

### **Bitcoin Development**
- [Bitcoin Core RPC](https://developer.bitcoin.org/reference/rpc/)
- [Lightning Network Specs](https://github.com/lightning/bolts)
- [Elements Project](https://elementsproject.org/)

### **JavaScript Moderno**
- [MDN JavaScript Guide](https://developer.mozilla.org/docs/Web/JavaScript/Guide)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 💡 Dicas de Desenvolvimento

### **1. Sempre Use Logs**
```javascript
const winston = require('winston');
const logger = winston.createLogger({
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Use em vez de console.log
logger.info('Pagamento processado', { txid: result.txid });
```

### **2. Valide Sempre as Entradas**
```javascript
function validatePayment(data) {
    if (!data.transactionId) throw new Error('transactionId obrigatório');
    if (!data.amount || data.amount <= 0) throw new Error('amount inválido');
    if (!['bitcoin', 'lightning', 'liquid'].includes(data.network)) {
        throw new Error('network inválida');
    }
}
```

### **3. Trate Erros Graciosamente**
```javascript
app.use((error, req, res, next) => {
    logger.error('Erro não tratado:', error);
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        timestamp: new Date().toISOString()
    });
});
```

## 🎯 Conclusão

Este projeto demonstra como integrar diferentes tecnologias (HTTP, gRPC, RPC) em uma solução coesa. Os conceitos aprendidos aqui podem ser aplicados em muitos outros projetos de blockchain e desenvolvimento web.

**Principais lições:**
- ✅ Separação clara de responsabilidades
- ✅ Comunicação entre diferentes protocolos
- ✅ Tratamento robusto de erros
- ✅ Automatização com scripts shell
- ✅ Segurança básica com autenticação

Continue praticando e experimentando com diferentes APIs e tecnologias!
