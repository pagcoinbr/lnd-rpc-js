# Servidor de Pagamentos Multi-Chain

Servidor HTTP para gerenciar pagamentos em três redes de Bitcoin: **Bitcoin on-chain**, **Lightning Network** e **Liquid (Elements)**. 

Este projeto permite receber requisições HTTP com informações de pagamento, processar e executar os pagamentos através de chamadas RPC aos respectivos nós, mantendo um registro completo das transações.

## 🌟 Funcionalidades

- ✅ **Recebimento de pagamentos via HTTP** com autenticação por chave secreta
- ✅ **Suporte a 3 redes**: Bitcoin, Lightning e Liquid
- ✅ **Processamento automático** de pagamentos baseado no tipo de endereço/rede
- ✅ **Sistema de filas** para pagamentos pendentes e enviados
- ✅ **Consulta de saldos** em todas as redes
- ✅ **Logs detalhados** de todas as operações
- ✅ **Verificação automática** de conectividade com os nós

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js (versão 14 ou superior)
- npm
- Nós configurados e sincronizados:
  - Bitcoin Core (RPC habilitado)
  - LND (Lightning Network Daemon)
  - Elements Core (Liquid)

### 1. Clone e Configure

```bash
git clone <repository-url>
cd lnd-rpc-py
```

### 2. Configure as Credenciais

Edite o arquivo `config/config.json` com suas credenciais RPC:

```json
{
  "server": {
    "port": 5002,
    "secretKey": "sua-chave-secreta-super-segura-aqui-123456"
  },
  "bitcoin": {
    "rpcHost": "localhost",
    "rpcPort": 8332,
    "rpcUser": "seu-usuario-bitcoin",
    "rpcPassword": "sua-senha-bitcoin"
  },
  "lightning": {
    "host": "localhost:10009",
    "certPath": "~/.lnd/tls.cert",
    "macaroonPath": "~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon"
  },
  "liquid": {
    "rpcHost": "localhost",
    "rpcPort": 7041,
    "rpcUser": "seu-usuario-liquid",
    "rpcPassword": "sua-senha-liquid"
  }
}
```

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

## 📖 Como Usar

### Estrutura da Requisição HTTP

**Endpoint**: `POST http://seu-servidor:5002/payment`

**Headers**:
```
Content-Type: application/json
x-secret-key: sua-chave-secreta-super-segura-aqui-123456
```

**Body JSON**:
```json
{
  "transactionId": "0198244a9ba37c8db6206de62db528c8",
  "username": "brunodasilva",
  "amount": 123456,
  "network": "lightning",
  "destinationWallet": "satiricrocket57@walletofsatoshi.com"
}
```

### Tipos de Rede Suportados

1. **Bitcoin**: `"network": "bitcoin"`
   - Endereços: Legacy, SegWit, Bech32
   - Exemplo: `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh`

2. **Lightning**: `"network": "lightning"`
   - Lightning invoices ou Lightning addresses
   - Exemplo: `satiricrocket57@walletofsatoshi.com`

3. **Liquid**: `"network": "liquid"`
   - Endereços Liquid/Elements
   - Exemplo: `lq1qq...` (endereços Liquid)

### Consultar Saldos

```bash
# Saldo Bitcoin
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/bitcoin

# Saldo Lightning
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/lightning

# Saldo Liquid
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/liquid
```

### Listar Pagamentos

```bash
# Pagamentos pendentes
curl -H "x-secret-key: sua-chave" http://localhost:5002/pending

# Pagamentos enviados
curl -H "x-secret-key: sua-chave" http://localhost:5002/sent
```

## 🔄 Fluxo de Processamento

1. **Recebimento**: Requisição HTTP chega no endpoint `/payment`
2. **Validação**: Verifica chave secreta e formato JSON
3. **Registro**: Salva requisição em `payment_req/`
4. **Detecção**: Identifica rede baseada no campo `network` e formato do endereço
5. **Processamento**: Executa pagamento via RPC do nó correspondente
6. **Confirmação**: Aguarda confirmação da transação
7. **Finalização**: Move arquivo para `payment_sent/` com hash da transação

## 📁 Estrutura de Diretórios

```
lnd-rpc-py/
├── config/
│   └── config.json           # Configurações RPC
├── logs/                     # Logs do servidor
├── payment_req/              # Pagamentos pendentes
├── payment_sent/             # Pagamentos enviados
├── proto/
│   └── lightning.proto       # Definições gRPC Lightning
├── src/
│   ├── server.js            # Servidor HTTP principal
│   ├── payment-processor.js # Processador de pagamentos
│   └── rpc/
│       ├── bitcoin-rpc.js   # Cliente RPC Bitcoin
│       ├── lightning-rpc.js # Cliente RPC Lightning
│       └── liquid-rpc.js    # Cliente RPC Liquid
├── start.sh                 # Script de inicialização
├── test.sh                  # Script de testes
└── package.json             # Dependências Node.js
```

## 🧪 Testes

Execute o script de testes para verificar todas as funcionalidades:

```bash
./test.sh
```

O script de teste verifica:
- ✅ Conectividade com o servidor
- ✅ Consulta de saldos em todas as redes
- ✅ Listagem de pagamentos
- ✅ Envio de pagamento de teste

## 🔧 Resolução de Problemas

### Erro de Conectividade

Se o `start.sh` mostrar erros de conectividade:

1. Verifique se os nós estão rodando
2. Confirme as credenciais RPC em `config/config.json`
3. Para Lightning, verifique os caminhos do certificado e macaroon

### Erro de Autenticação

- Verifique se a chave secreta no header `x-secret-key` está correta
- Confirme se a chave no `config.json` corresponde à usada nas requisições

### Arquivos de Log

Verifique os logs em `logs/payment-server.log` para detalhes sobre erros.

## 🛡️ Segurança

- ✅ Autenticação obrigatória via chave secreta
- ✅ Validação de entrada em todas as requisições
- ✅ Logs detalhados para auditoria
- ✅ Isolamento de credenciais em arquivo de configuração

## 📊 Monitoramento

O servidor registra:
- Todas as requisições HTTP recebidas
- Status de processamento de pagamentos
- Erros e exceções
- Conectividade com os nós RPC

## 🔗 Integração

### Exemplo de Cliente Python

```python
import requests
import json

url = "http://100.77.237.26:5002/payment"
headers = {
    "Content-Type": "application/json",
    "x-secret-key": "sua-chave-secreta-super-segura-aqui-123456"
}

payment_data = {
    "transactionId": "0198244a9ba37c8db6206de62db528c8",
    "username": "brunodasilva", 
    "amount": 123456,
    "network": "lightning",
    "destinationWallet": "satiricrocket57@walletofsatoshi.com"
}

response = requests.post(url, headers=headers, json=payment_data)
print(response.json())
```

## 📄 Licença

Este projeto está sob licença MIT. Veja o arquivo LICENSE para mais detalhes.