# Servidor de Pagamentos Multi-Chain com LND

Servidor HTTP para gerenciar pag### 3. Instalação Simples

```bash
./start.sh
```

O script `start.sh` automaticamente:
- Verifica dependências
- Instala pacotes npm necessários
- Baixa o arquivo `lightning.proto`
- Cria diretórios necessários
- Verifica conectividade com os nós
- Inicia o servidor na porta 5002

### 4. Instalação como Serviço (Recomendado para Produção)

Para ambientes de produção, é recomendado configurar como serviço systemd:

```bash
# Opção 1: Usar start.sh com flag de serviço
sudo ./start.sh --service

# Opção 2: Usar script de serviço diretamente
sudo ./service.sh install
sudo ./service.sh start
```

**Vantagens do serviço systemd**:
- ✅ Auto-restart em caso de falha
- ✅ Inicialização automática no boot
- ✅ Logs centralizados no journald
- ✅ Controle via systemctl
- ✅ Isolamento de segurança

**Comandos do serviço**:
```bash
sudo ./service.sh start    # Iniciar
sudo ./service.sh stop     # Parar
sudo ./service.sh restart  # Reiniciar
./service.sh status        # Ver status
./service.sh logs         # Logs em tempo real
```

📖 **Documentação completa**: Veja [SERVICE.md](SERVICE.md) para detalhes sobre o serviço.ês redes de Bitcoin: **Bitcoin on-chain**, **Lightning Network** e **Liquid (Elements)**. 

Este projeto utiliza o **LND (Lightning Network Daemon)** como cliente principal para transações Bitcoin (on-chain e Lightning), eliminando a necessidade de um cliente Bitcoin Core separado. O LND oferece funcionalidades completas para ambas as redes através de uma única interface.

## 🌟 Funcionalidades

- ✅ **Recebimento de pagamentos via HTTP** com autenticação por chave secreta e validação de IP
- ✅ **Suporte a 3 redes**: Bitcoin on-chain, Lightning Network e Liquid
- ✅ **LND como cliente unificado** para Bitcoin e Lightning (elimina dependência do Bitcoin Core)
- ✅ **Detecção automática** de tipo de pagamento (on-chain vs Lightning)
- ✅ **Suporte a Lightning Addresses** e invoices bolt11
- ✅ **Sistema de filas** para pagamentos pendentes e enviados
- ✅ **Consulta de saldos** unificada (wallet on-chain + canais Lightning)
- ✅ **Logs detalhados** de todas as operações
- ✅ **Estimativa automática de taxas** para transações on-chain

## 🚀 Instalação e Configuração

### Pré-requisitos

- **Node.js** (versão 16 ou superior)
- **npm** (versão 8 ou superior)
- **LND** (versão 0.15.0 ou superior) - Principal cliente para Bitcoin e Lightning
- **Elements Core** (versão 22.0 ou superior) - Cliente RPC para rede Liquid
- **Sistema Operacional**: Linux (Ubuntu 20.04+), macOS (10.15+), Windows (WSL2)

#### Requisitos de Hardware

- **RAM**: Mínimo 2GB (recomendado 4GB)
- **Storage**: 50MB para aplicação + espaço para blockchain sync
- **Rede**: Conexão estável à internet para Lightning Addresses e sync

#### Arquivos de Autenticação LND

- `tls.cert` - Certificado TLS do LND (geralmente em `~/.lnd/tls.cert`)
- `admin.macaroon` - Macaroon de autenticação (ou macaroon customizado com permissões específicas)

### 1. Clone e Configure

```bash
git clone <repository-url>
cd lnd-rpc-py
```

### 2. Configure as Credenciais

Edite o arquivo `config/config.json` com suas credenciais:

```json
{
  "server": {
    "port": 5002,
    "secretKey": "sua-chave-secreta-super-segura-aqui-123456",
    "allowedIps": ["100.77.237.26", "127.0.0.1"]
  },
  "lightning": {
    "host": "localhost:10009",
    "tlsCertPath": "~/.lnd/tls.cert",
    "macaroonPath": "~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon"
  },
  "liquid": {
    "rpcHost": "localhost",
    "rpcPort": 7041,
    "rpcUser": "seu-usuario-liquid",
    "rpcPassword": "sua-senha-liquid",
    "network": "liquidv1"
  },
  "logging": {
    "level": "info",
    "filename": "logs/payment-server.log"
  }
}
```

**Importante**: A configuração `bitcoin` foi removida, pois agora o LND gerencia tanto transações on-chain quanto Lightning.

### 3. Inicie o Servidor

```bash
./start.sh
```

O script `start.sh` automaticamente:
- Verifica dependências
- Instala pacotes npm necessários
- Baixa o arquivo `lightning.proto`
- Cria diretórios necessários
- Verifica conectividade com os nós
- Inicia o servidor na porta 5002

## 📖 API Completa - Todos os Comandos Disponíveis

### 🚀 Endpoint Principal - Envio de Pagamentos

**Endpoint**: `POST http://seu-servidor:5002/payment`

**Headers obrigatórios**:
```
Content-Type: application/json
x-secret-key: sua-chave-secreta-super-segura-aqui-123456
```

**Estrutura do Body JSON**:
```json
{
  "transactionId": "ID_UNICO_DA_TRANSACAO",
  "username": "nome_do_usuario", 
  "amount": VALOR_EM_SATOSHIS,
  "network": "TIPO_DE_REDE",
  "destinationWallet": "DESTINO_DO_PAGAMENTO"
}
```

#### 📋 Campos Obrigatórios

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `transactionId` | String | ID único para rastrear a transação | `"tx_001_2024"` |
| `username` | String | Identificação do usuário solicitante | `"joão.silva"` |
| `amount` | Number | Valor em satoshis (1 BTC = 100.000.000 sats) | `50000` |
| `network` | String | Rede de destino: `bitcoin`, `lightning` ou `liquid` | `"lightning"` |
| `destinationWallet` | String | Endereço, invoice ou Lightning address de destino | `"user@domain.com"` |

#### 🎯 Exemplos Completos de Requisições

**1. Pagamento Lightning com Lightning Address:**
```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "ln_payment_001",
    "username": "alice",
    "amount": 21000,
    "network": "lightning",
    "destinationWallet": "satoshi@walletofsatoshi.com"
  }'
```

**2. Pagamento Lightning com Invoice (BOLT11):**
```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "ln_invoice_002",
    "username": "bob",
    "amount": 100000,
    "network": "lightning",
    "destinationWallet": "lnbc1m1p3xnhl2pp5j5k8stwzfhhsfl0kxhkn9k7c8g6wkrp4f8w2xqb5j7jy6h6r2qdqqcqzpgxqyz5vqsp5..."
  }'
```

**3. Pagamento Bitcoin On-chain:**
```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "btc_onchain_003",
    "username": "carol",
    "amount": 500000,
    "network": "bitcoin",
    "destinationWallet": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
  }'
```

**4. Pagamento Liquid:**
```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "liquid_004",
    "username": "dave",
    "amount": 75000,
    "network": "liquid",
    "destinationWallet": "lq1qq2xvpcvfup5j8zscjq05u2wxxjcyewk7979f3mmz5l7uw5pqmx6xf5xy9chfu5v39jn8jd5x"
  }'
```

#### ✅ Resposta de Sucesso

```json
{
  "success": true,
  "message": "Pagamento processado com sucesso",
  "paymentId": "uuid-gerado-automaticamente",
  "transactionHash": "hash_da_transacao_na_rede"
}
```

#### ❌ Respostas de Erro

**Dados faltando (400):**
```json
{
  "error": "Dados obrigatórios faltando",
  "required": ["transactionId", "username", "amount", "network", "destinationWallet"]
}
```

**Rede não suportada (400):**
```json
{
  "error": "Rede não suportada",
  "supported": ["bitcoin", "lightning", "liquid"]
}
```

### 🔍 Detecção Automática de Tipo de Pagamento

O sistema detecta automaticamente o tipo baseado no formato do destino:

| Tipo | Padrões Reconhecidos | Exemplos |
|------|---------------------|----------|
| **Lightning Invoice** | Começa com `ln` | `lnbc1m1p3xnhl2pp5...` |
| **Lightning Address** | Formato `user@domain.com` | `alice@walletofsatoshi.com` |
| **Bitcoin Legacy** | Começa com `1` ou `3` | `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` |
| **Bitcoin Bech32** | Começa com `bc1` | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` |
| **Liquid** | Começa com `lq1` ou outros padrões | `lq1qq2xvpcvfup5j8zscjq05u2w...` |

**⚠️ Importante**: Mesmo especificando `"network": "bitcoin"`, se o destino for uma Lightning address ou invoice, o pagamento será processado via Lightning Network automaticamente.

### 💰 Consulta de Saldos

#### 1. Saldo de Rede Específica

**Endpoint**: `GET http://seu-servidor:5002/balance/{network}`

**Networks suportadas**: `bitcoin`, `lightning`, `liquid`, `all`

```bash
# Saldo Bitcoin on-chain (gerenciado pelo LND)
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/balance/bitcoin

# Saldo dos canais Lightning (gerenciado pelo LND) 
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/balance/lightning

# Saldo Liquid (gerenciado pelo Elements Core)
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/balance/liquid
```

**Resposta de exemplo:**
```json
{
  "success": true,
  "network": "lightning",
  "balance": {
    "total_balance": "1500000",
    "confirmed_balance": "1500000", 
    "local_balance": {
      "sat": "750000",
      "msat": "750000000"
    },
    "remote_balance": {
      "sat": "750000", 
      "msat": "750000000"
    }
  }
}
```

#### 2. Todos os Saldos de Uma Vez

```bash
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/balance/all
```

**Resposta consolidada:**
```json
{
  "success": true,
  "balances": {
    "bitcoin": {
      "total_balance": "5000000",
      "confirmed_balance": "5000000",
      "unconfirmed_balance": "0"
    },
    "lightning": {
      "local_balance": {"sat": "750000", "msat": "750000000"},
      "remote_balance": {"sat": "750000", "msat": "750000000"}
    },
    "liquid": {
      "balance": "2500000",
      "unconfirmed_balance": "0"
    },
    "timestamp": "2024-07-20T10:30:00.000Z"
  }
}
```

### 📋 Gerenciamento de Pagamentos

#### 1. Listar Pagamentos Pendentes

**Endpoint**: `GET http://seu-servidor:5002/pending`

```bash
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/pending
```

**Resposta:**
```json
{
  "success": true,
  "count": 2,
  "payments": [
    {
      "filename": "uuid_tx001.json",
      "id": "payment-uuid-1",
      "transactionId": "tx001",
      "username": "alice",
      "amount": 50000,
      "network": "lightning",
      "destinationWallet": "bob@wallet.com",
      "timestamp": "2024-07-20T10:15:00.000Z",
      "status": "pending"
    }
  ]
}
```

#### 2. Listar Pagamentos Enviados/Concluídos

**Endpoint**: `GET http://seu-servidor:5002/sent`

```bash
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/sent
```

**Resposta:**
```json
{
  "success": true,
  "count": 5,
  "payments": [
    {
      "filename": "uuid_tx002.json",
      "id": "payment-uuid-2",
      "transactionId": "tx002",
      "username": "carol",
      "amount": 100000,
      "network": "bitcoin",
      "destinationWallet": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "timestamp": "2024-07-20T09:30:00.000Z",
      "status": "sent",
      "transactionHash": "a1b2c3d4e5f6...",
      "completedAt": "2024-07-20T09:31:15.000Z",
      "networkFee": 150
    }
  ]
}
```

### 🛠️ Exemplos Práticos com Valores Reais

#### Pagamento de 1.000 sats via Lightning

```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "coffee_payment_001",
    "username": "cliente_loja",
    "amount": 1000,
    "network": "lightning", 
    "destinationWallet": "loja@getalby.com"
  }'
```

#### Pagamento de 0.001 BTC (100.000 sats) on-chain

```bash
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "btc_withdrawal_002", 
    "username": "usuario_exchange",
    "amount": 100000,
    "network": "bitcoin",
    "destinationWallet": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
  }'
```

#### Conversão de Valores

| Unidade | Satoshis | BTC | Exemplo de Uso |
|---------|----------|-----|----------------|
| 1 satoshi | 1 | 0.00000001 | Micropagamento |
| 1.000 sats | 1,000 | 0.00001 | Café/Gorjeta |
| 10.000 sats | 10,000 | 0.0001 | Serviço pequeno |
| 100.000 sats | 100,000 | 0.001 | Compra média |
| 1.000.000 sats | 1,000,000 | 0.01 | Compra grande |

## 🔄 Fluxo de Processamento

1. **Recebimento**: Requisição HTTP chega no endpoint `/payment`
2. **Validação**: Verifica IP permitido, chave secreta e formato JSON
3. **Registro**: Salva requisição em `payment_req/`
4. **Detecção**: Identifica automaticamente se é Lightning ou on-chain baseado no destino
5. **Roteamento**: 
   - **Bitcoin/Lightning** → LND (gRPC)
   - **Liquid** → Elements Core (JSON-RPC)
6. **Processamento**: Executa pagamento via interface apropriada
7. **Confirmação**: Aguarda confirmação da transação
8. **Finalização**: Move arquivo para `payment_sent/` com hash da transação

## 📁 Estrutura de Diretórios

```
lnd-rpc-py/
├── config/
│   └── config.json           # Configurações do servidor e RPCs
├── logs/                     # Logs do servidor
├── payment_req/              # Pagamentos pendentes
├── payment_sent/             # Pagamentos enviados
├── proto/
│   └── lightning.proto       # Definições gRPC do LND
├── src/
│   ├── server.js            # Servidor HTTP principal
│   ├── payment-processor.js # Processador unificado
│   └── rpc/
│       ├── lightning-rpc.js # Cliente LND (Bitcoin + Lightning)
│       └── liquid-rpc.js    # Cliente Elements (Liquid)
├── start.sh                 # Script de inicialização
├── test.sh                  # Script de testes
├── DEVELOPMENT.md           # Documentação técnica detalhada
└── package.json             # Dependências Node.js
```

**Mudanças importantes**:
- ❌ Removido `bitcoin-rpc.js` (substituído por funcionalidades no `lightning-rpc.js`)
- ✅ `lightning-rpc.js` agora gerencia tanto Lightning quanto Bitcoin on-chain
- ✅ Novo arquivo `DEVELOPMENT.md` com documentação técnica

### 🔧 Scripts de Teste e Validação

#### Script de Teste Automatizado

Execute o script de teste que valida todas as funcionalidades:

```bash
./test.sh
```

**O que o script testa:**
- ✅ Conectividade com o servidor
- ✅ Consulta de saldos em todas as redes (bitcoin, lightning, liquid)
- ✅ Listagem de pagamentos pendentes e enviados
- ✅ Envio de pagamento de teste (simulação)

#### Teste Manual de Conectividade

```bash
# Verificar se servidor está rodando
curl -I http://localhost:5002

# Teste de autenticação (deve retornar 401 sem chave)
curl http://localhost:5002/balance/bitcoin

# Teste com chave correta
curl -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  http://localhost:5002/balance/bitcoin
```

#### Validação dos Nós

**Verificar LND:**
```bash
# Via lncli (se disponível)
lncli getinfo
lncli walletbalance
lncli channelbalance

# Via API do servidor
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/bitcoin
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/lightning
```

**Verificar Elements/Liquid:**
```bash
# Via elements-cli (se disponível)  
elements-cli getbalance

# Via API do servidor
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/liquid
```

### 🛡️ Segurança e Boas Práticas

#### Headers de Segurança Obrigatórios

```bash
# SEMPRE incluir ambos os headers
-H "Content-Type: application/json"
-H "x-secret-key: SUA_CHAVE_SECRETA_AQUI"
```

#### Validação de IP

O servidor só aceita requisições de IPs configurados em `config.json`:

```json
{
  "server": {
    "allowedIps": [
      "127.0.0.1",        // localhost
      "192.168.1.100",    // IP local específico  
      "203.0.113.10"      // IP público específico
    ]
  }
}
```

**Para desenvolvimento local**, certifique-se de incluir:
- `"127.0.0.1"` - IPv4 localhost
- `"::1"` - IPv6 localhost (incluído automaticamente)

#### Logs de Auditoria

Todas as requisições são logadas em `logs/payment-server.log`:

```bash
# Acompanhar logs em tempo real
tail -f logs/payment-server.log

# Filtrar apenas pagamentos
grep "Nova requisição de pagamento" logs/payment-server.log

# Filtrar erros
grep "ERROR" logs/payment-server.log
```

### ⚠️ Códigos de Erro Comuns

| Código | Erro | Solução |
|--------|------|---------|
| **403** | IP não autorizado | Adicionar IP em `config.json > allowedIps` |
| **401** | Chave secreta inválida | Verificar header `x-secret-key` |
| **400** | Dados obrigatórios faltando | Incluir todos os campos: `transactionId`, `username`, `amount`, `network`, `destinationWallet` |
| **400** | Rede não suportada | Usar: `bitcoin`, `lightning` ou `liquid` |
| **500** | Erro interno | Verificar logs e conectividade com nós |

### 📊 Monitoramento em Produção

#### Status dos Serviços

```bash
# Status do serviço systemd
sudo systemctl status lnd-rpc-js

# Logs do serviço  
sudo journalctl -u lnd-rpc-js -f

# Uso do script de gerenciamento
./service.sh status
./service.sh logs
```

#### Métricas de Performance

```bash
# Verificar uso de recursos
ps aux | grep node
netstat -tlnp | grep 5002

# Tamanho dos arquivos de pagamentos
ls -la payment_req/ payment_sent/
wc -l logs/payment-server.log
```

#### Backup dos Dados

```bash
# Backup diário dos pagamentos
tar -czf backup_$(date +%Y%m%d).tar.gz payment_req/ payment_sent/ logs/

# Limpeza de logs antigos (manter últimos 30 dias)
find logs/ -name "*.log.*" -mtime +30 -delete
```

## 🔧 Resolução de Problemas

### ❌ Problemas Comuns com Requisições de Pagamento

#### 1. Erro 400 - "Dados obrigatórios faltando"

**Problema**: Um ou mais campos obrigatórios não foram enviados.

**Solução**: Verificar se TODOS os campos estão presentes:
```json
{
  "transactionId": "OBRIGATÓRIO - String única",
  "username": "OBRIGATÓRIO - String do usuário", 
  "amount": "OBRIGATÓRIO - Number em satoshis",
  "network": "OBRIGATÓRIO - bitcoin|lightning|liquid",
  "destinationWallet": "OBRIGATÓRIO - Endereço/invoice/address"
}
```

**Exemplo incorreto** ❌:
```json
{
  "transactionId": "tx001",
  "amount": 50000,
  "network": "lightning"
  // Faltando: username e destinationWallet
}
```

**Exemplo correto** ✅:
```json
{
  "transactionId": "tx001",
  "username": "alice",
  "amount": 50000,
  "network": "lightning", 
  "destinationWallet": "bob@getalby.com"
}
```

#### 2. Erro 400 - "Rede não suportada"

**Problema**: Valor inválido no campo `network`.

**Valores aceitos**: `bitcoin`, `lightning`, `liquid` (case-insensitive)

**Exemplos incorretos** ❌:
```json
{"network": "btc"}        // Use "bitcoin"
{"network": "ln"}         // Use "lightning"  
{"network": "ethereum"}   // Não suportado
```

#### 3. Problemas com Lightning Addresses

**Formato correto**: `usuario@dominio.com`

**Problemas comuns**:
- ❌ `usuario.dominio.com` (faltando @)
- ❌ `@dominio.com` (faltando usuário)
- ❌ `usuario@` (faltando domínio)
- ❌ `usuario@dominio` (domínio sem TLD)

**Exemplos válidos** ✅:
- `satoshi@walletofsatoshi.com`
- `alice@getalby.com`
- `user@strike.me`

#### 4. Problemas com Lightning Invoices (BOLT11)

**Formato**: Sempre começam com `ln` + rede + valor

**Problemas comuns**:
- ❌ Invoice expirada
- ❌ Invoice já paga
- ❌ Valor na requisição diferente do invoice
- ❌ Invoice de rede diferente (mainnet vs testnet)

**Validação**:
```bash
# Decodificar invoice para verificar
lncli decodepayreq lnbc1m1p3xnhl2pp5...
```

#### 5. Problemas com Endereços Bitcoin

**Formatos válidos**:
- Legacy: `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`
- P2SH: `3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy`
- Bech32: `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh`

**Problemas comuns**:
- ❌ Endereço de testnet em mainnet (ou vice-versa)
- ❌ Caracteres inválidos
- ❌ Checksum incorreto

#### 6. Problemas com Valores (amount)

**Formato**: Sempre em satoshis (número inteiro)

**Conversões**:
```
1 BTC = 100.000.000 satoshis
0.1 BTC = 10.000.000 satoshis  
0.01 BTC = 1.000.000 satoshis
0.001 BTC = 100.000 satoshis
```

**Problemas comuns**:
- ❌ `"amount": "50000"` (string em vez de number)
- ❌ `"amount": 0.5` (decimal em vez de inteiro)
- ❌ `"amount": 50000000000` (valor muito alto)

**Correto** ✅:
```json
{"amount": 50000}  // 50.000 satoshis = 0.0005 BTC
```

### ⚠️ Problemas de Conectividade

#### Erro de Conectividade com LND

**Sintomas**:
```
Error: Erro interno do servidor
Message: 14 UNAVAILABLE: No connection established
```

**Soluções**:

1. **Verificar se LND está rodando**:
   ```bash
   lncli getinfo
   # ou
   ps aux | grep lnd
   ```

2. **Verificar caminhos no config.json**:
   ```json
   {
     "lightning": {
       "host": "localhost:10009",
       "tlsCertPath": "/root/.lnd/tls.cert",        // Verificar caminho
       "macaroonPath": "/root/.lnd/data/chain/bitcoin/testnet/admin.macaroon"
     }
   }
   ```

3. **Verificar permissões dos arquivos**:
   ```bash
   ls -la ~/.lnd/tls.cert
   ls -la ~/.lnd/data/chain/bitcoin/testnet/admin.macaroon
   ```

4. **Testar conectividade direta**:
   ```bash
   lncli walletbalance
   lncli channelbalance
   ```

#### Problemas com Lightning Addresses

**Sintomas**:
```
Error: Falha ao resolver Lightning Address
```

**Soluções**:
1. Verificar conectividade com internet
2. Testar manualmente:
   ```bash
   curl https://walletofsatoshi.com/.well-known/lnurlp/satoshi
   ```
3. Verificar se domínio suporta LNURL-pay

### 🔍 Debugging com Logs

#### Ativar logs detalhados

Editar `config.json`:
```json
{
  "logging": {
    "level": "debug",  // Mudar de "info" para "debug"
    "filename": "logs/payment-server.log"
  }
}
```

#### Analisar logs

```bash
# Logs em tempo real
tail -f logs/payment-server.log

# Filtrar erros específicos
grep "UNAVAILABLE" logs/payment-server.log
grep "Lightning Address" logs/payment-server.log
grep "Payment failed" logs/payment-server.log

# Ver últimas 50 linhas
tail -50 logs/payment-server.log
```

### 🧪 Testes de Validação

#### Teste de conectividade básica

```bash
# 1. Servidor rodando?
curl -I http://localhost:5002

# 2. Autenticação funcionando?
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/bitcoin

# 3. LND conectado?
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/lightning

# 4. Elements conectado?
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/liquid
```

#### Teste de pagamento mínimo

```bash
# Pagamento de teste (1 satoshi)
curl -X POST http://localhost:5002/payment \
  -H "Content-Type: application/json" \
  -H "x-secret-key: sua-chave-secreta-super-segura-aqui-123456" \
  -d '{
    "transactionId": "test_minimum",
    "username": "test_user",
    "amount": 1,
    "network": "lightning",
    "destinationWallet": "test@getalby.com"
  }'
```

## 🛡️ Segurança

- ✅ Autenticação obrigatória via chave secreta
- ✅ Validação de IPs permitidos (whitelist)
- ✅ Validação de entrada em todas as requisições
- ✅ Logs detalhados para auditoria
- ✅ Isolamento de credenciais em arquivo de configuração
- ✅ Comunicação segura com LND via TLS + Macaroons
- ✅ Timeouts em requisições HTTP externas (Lightning Addresses)

## 📊 Monitoramento

O servidor registra:
- Todas as requisições HTTP recebidas (com IP de origem)
- Status de processamento de pagamentos (pendente → enviado → confirmado)
- Detecção automática de tipo de pagamento
- Erros e exceções detalhadas
- Conectividade com LND e Elements Core
- Performance de resolução de Lightning Addresses

### Métricas Disponíveis

- **Saldos em tempo real**: Bitcoin on-chain, Lightning channels, Liquid
- **Histórico de transações**: Via LND e Elements
- **Status de canais Lightning**: Através do LND
- **Estimativas de taxa**: Para transações on-chain

### � Exemplos de Integração em Diferentes Linguagens

#### Python
```python
import requests
import json

class LNDRPCClient:
    def __init__(self, server_url, secret_key):
        self.server_url = server_url
        self.headers = {
            "Content-Type": "application/json",
            "x-secret-key": secret_key
        }
    
    def send_payment(self, transaction_id, username, amount, network, destination):
        """Enviar pagamento"""
        payment_data = {
            "transactionId": transaction_id,
            "username": username,
            "amount": amount,
            "network": network,
            "destinationWallet": destination
        }
        
        response = requests.post(
            f"{self.server_url}/payment",
            headers=self.headers,
            json=payment_data
        )
        return response.json()
    
    def get_balance(self, network="all"):
        """Consultar saldo"""
        response = requests.get(
            f"{self.server_url}/balance/{network}",
            headers=self.headers
        )
        return response.json()
    
    def get_pending_payments(self):
        """Listar pagamentos pendentes"""
        response = requests.get(
            f"{self.server_url}/pending",
            headers=self.headers
        )
        return response.json()

# Exemplo de uso
client = LNDRPCClient(
    "http://100.77.237.26:5002",
    "sua-chave-secreta-super-segura-aqui-123456"
)

# Enviar pagamento Lightning
result = client.send_payment(
    transaction_id="py_ln_001",
    username="python_user",
    amount=25000,
    network="lightning",
    destination="satoshi@getalby.com"
)
print(f"Pagamento enviado: {result}")

# Consultar saldos
balances = client.get_balance("all")
print(f"Saldos: {balances}")
```

#### JavaScript/Node.js
```javascript
const axios = require('axios');

class LNDRPCClient {
  constructor(serverUrl, secretKey) {
    this.serverUrl = serverUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'x-secret-key': secretKey
    };
  }

  async sendPayment(transactionId, username, amount, network, destination) {
    const paymentData = {
      transactionId,
      username,
      amount,
      network,
      destinationWallet: destination
    };

    try {
      const response = await axios.post(
        `${this.serverUrl}/payment`,
        paymentData,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Payment failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getBalance(network = 'all') {
    try {
      const response = await axios.get(
        `${this.serverUrl}/balance/${network}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Balance query failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getPendingPayments() {
    try {
      const response = await axios.get(
        `${this.serverUrl}/pending`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Pending payments query failed: ${error.response?.data?.error || error.message}`);
    }
  }
}

// Exemplo de uso
const client = new LNDRPCClient(
  'http://localhost:5002',
  'sua-chave-secreta-super-segura-aqui-123456'
);

// Exemplo com async/await
(async () => {
  try {
    // Enviar pagamento Bitcoin on-chain
    const payment = await client.sendPayment(
      'js_btc_001',
      'javascript_user',
      150000,
      'bitcoin',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
    );
    console.log('Pagamento enviado:', payment);

    // Consultar saldo Lightning
    const lightningBalance = await client.getBalance('lightning');
    console.log('Saldo Lightning:', lightningBalance);

  } catch (error) {
    console.error('Erro:', error.message);
  }
})();
```

#### PHP
```php
<?php
class LNDRPCClient {
    private $serverUrl;
    private $secretKey;

    public function __construct($serverUrl, $secretKey) {
        $this->serverUrl = rtrim($serverUrl, '/');
        $this->secretKey = $secretKey;
    }

    private function makeRequest($method, $endpoint, $data = null) {
        $url = $this->serverUrl . $endpoint;
        
        $headers = [
            'Content-Type: application/json',
            'x-secret-key: ' . $this->secretKey
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decodedResponse = json_decode($response, true);
        
        if ($httpCode >= 400) {
            throw new Exception("HTTP Error $httpCode: " . ($decodedResponse['error'] ?? 'Unknown error'));
        }

        return $decodedResponse;
    }

    public function sendPayment($transactionId, $username, $amount, $network, $destination) {
        $data = [
            'transactionId' => $transactionId,
            'username' => $username,
            'amount' => (int)$amount,
            'network' => $network,
            'destinationWallet' => $destination
        ];

        return $this->makeRequest('POST', '/payment', $data);
    }

    public function getBalance($network = 'all') {
        return $this->makeRequest('GET', "/balance/$network");
    }

    public function getPendingPayments() {
        return $this->makeRequest('GET', '/pending');
    }

    public function getSentPayments() {
        return $this->makeRequest('GET', '/sent');
    }
}

// Exemplo de uso
try {
    $client = new LNDRPCClient(
        'http://localhost:5002',
        'sua-chave-secreta-super-segura-aqui-123456'
    );

    // Enviar pagamento Liquid
    $payment = $client->sendPayment(
        'php_liquid_001',
        'php_user',
        80000,
        'liquid',
        'lq1qq2xvpcvfup5j8zscjq05u2wxxjcyewk7979f3mmz5l7uw5pqmx6xf5xy9chfu5v39jn8jd5x'
    );
    
    echo "Pagamento enviado: " . json_encode($payment, JSON_PRETTY_PRINT) . "\n";

    // Consultar todos os saldos
    $balances = $client->getBalance('all');
    echo "Saldos: " . json_encode($balances, JSON_PRETTY_PRINT) . "\n";

} catch (Exception $e) {
    echo "Erro: " . $e->getMessage() . "\n";
}
?>
```

#### Bash/Shell Script
```bash
#!/bin/bash

# Configurações
SERVER_URL="http://localhost:5002"
SECRET_KEY="sua-chave-secreta-super-segura-aqui-123456"

# Função para fazer requisições
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ "$method" = "GET" ]; then
        curl -s -H "x-secret-key: $SECRET_KEY" "$SERVER_URL$endpoint"
    else
        curl -s -X $method \
            -H "Content-Type: application/json" \
            -H "x-secret-key: $SECRET_KEY" \
            -d "$data" \
            "$SERVER_URL$endpoint"
    fi
}

# Função para enviar pagamento
send_payment() {
    local tx_id=$1
    local username=$2
    local amount=$3
    local network=$4
    local destination=$5
    
    local payload=$(cat <<EOF
{
  "transactionId": "$tx_id",
  "username": "$username",
  "amount": $amount,
  "network": "$network",
  "destinationWallet": "$destination"
}
EOF
)
    
    echo "Enviando pagamento..."
    make_request "POST" "/payment" "$payload"
}

# Função para consultar saldo
get_balance() {
    local network=${1:-all}
    echo "Consultando saldo da rede: $network"
    make_request "GET" "/balance/$network"
}

# Exemplos de uso
echo "=== Teste de Saldos ==="
get_balance "bitcoin" | jq .
get_balance "lightning" | jq .
get_balance "all" | jq .

echo -e "\n=== Teste de Pagamento ==="
send_payment \
    "bash_test_$(date +%s)" \
    "bash_user" \
    5000 \
    "lightning" \
    "test@walletofsatoshi.com" | jq .

echo -e "\n=== Pagamentos Pendentes ==="
make_request "GET" "/pending" | jq .
```

## ⚡ Vantagens do LND como Cliente Unificado

### Por que usar LND em vez de Bitcoin Core?

1. **Interface Unificada**: Um único cliente para Bitcoin on-chain e Lightning
2. **Menos Recursos**: LND consome menos recursos que Bitcoin Core + LND separados
3. **Sincronização Mais Rápida**: LND pode usar Neutrino (SPV) para sincronização leve
4. **APIs Modernas**: gRPC nativo com streaming e tipos bem definidos
5. **Gestão Integrada**: Saldos, transações e canais em uma única interface

### Funcionalidades Bitcoin On-chain via LND

- ✅ **Envio de transações**: `sendCoins` com estimativa automática de taxa
- ✅ **Recebimento**: Geração de endereços (P2WKH, P2SH, Taproot)
- ✅ **Saldo**: Confirmado, não confirmado e total
- ✅ **Histórico**: Listagem de transações on-chain
- ✅ **Estimativa de taxas**: Baseada em target de confirmações
- ✅ **Múltiplos tipos de endereço**: Legacy, SegWit nativo, Taproot

### Lightning Network nativo

- ✅ **Pagamentos instantâneos**: Através de invoices ou Lightning Addresses
- ✅ **Recebimento**: Geração de invoices com valor e descrição
- ✅ **Gestão de canais**: Abertura, fechamento, balanceamento
- ✅ **Roteamento inteligente**: Encontra as melhores rotas automaticamente
- ✅ **Lightning Addresses**: Suporte nativo via LNURL-pay

## � Documentação Adicional

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Documentação técnica completa para desenvolvedores
- **[Configuração do LND](https://docs.lightning.engineering/)** - Guia oficial do Lightning Labs
- **[Elements/Liquid](https://elementsproject.org/)** - Documentação da rede Liquid

## 🔄 Changelog e Migrações

### v2.0.0 - Unificação com LND

**Mudanças Breaking**:
- ❌ Removida dependência do Bitcoin Core
- ✅ LND agora gerencia Bitcoin on-chain + Lightning
- ✅ Detecção automática de tipo de pagamento
- ✅ Suporte a Lightning Addresses via LNURL

**Migração da v1.x**:
1. Remover configuração `bitcoin` do `config.json`
2. Verificar se LND tem wallet on-chain configurada
3. Atualizar scripts que dependem de Bitcoin Core RPC
4. Testar conectividade com `lncli getinfo`

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Diretrizes de Desenvolvimento

- Siga os padrões ESLint configurados
- Adicione testes para novas funcionalidades
- Mantenha a documentação atualizada
- Use commits semânticos (feat:, fix:, docs:, etc.)

## �📄 Licença

Este projeto está sob licença MIT. Veja o arquivo LICENSE para mais detalhes.

---

**⚡ Powered by Lightning Network & Liquid Bitcoin ⚡**
