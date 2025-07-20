# Servidor de Pagamentos Multi-Chain com LND

Servidor HTTP para gerenciar pagamentos em três redes de Bitcoin: **Bitcoin on-chain**, **Lightning Network** e **Liquid (Elements)**. 

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
  "username": "mariasilva",
  "amount": 123456,
  "network": "lightning",
  "destinationWallet": "satoshinakamoto@walletofsatoshi.com"
}
```

### Tipos de Rede e Detecção Automática

1. **Bitcoin On-chain**: `"network": "bitcoin"`
   - Endereços: Legacy (1...), SegWit (3...), Bech32 (bc1...)
   - Exemplo: `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh`
   - **Processado pelo LND**: Usa `sendCoins` para transações on-chain

2. **Lightning Network**: `"network": "lightning"`
   - Lightning invoices (ln...) ou Lightning addresses (user@domain.com)
   - Exemplo invoice: `lnbc100n1p3xnhl2pp5j5...`
   - Exemplo address: `satiricrocket57@walletofsatoshi.com`
   - **Processado pelo LND**: Usa `sendPaymentSync` para pagamentos Lightning

3. **Liquid**: `"network": "liquid"`
   - Endereços Liquid/Elements
   - Exemplo: `lq1qq...` (endereços Liquid confidenciais)
   - **Processado pelo Elements Core**: RPC tradicional

**Detecção Automática**: O sistema detecta automaticamente se o destino é Lightning (invoice/address) ou Bitcoin on-chain (endereço), mesmo quando `network: "bitcoin"` é especificado.

### Consultar Saldos

```bash
# Saldo Bitcoin on-chain (através do LND)
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/bitcoin

# Saldo dos canais Lightning (através do LND)
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/lightning

# Saldo Liquid (através do Elements Core)
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/liquid

# Obter todos os saldos de uma vez
curl -H "x-secret-key: sua-chave" http://localhost:5002/balance/all
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

### Erro de Conectividade com LND

Se o `start.sh` mostrar erros de conectividade:

1. **Verifique se o LND está rodando**:
   ```bash
   lncli getinfo
   ```

2. **Confirme os caminhos dos arquivos LND**:
   - `tls.cert`: Geralmente em `~/.lnd/tls.cert`
   - `admin.macaroon`: Geralmente em `~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon`

3. **Verifique permissões dos arquivos**:
   ```bash
   ls -la ~/.lnd/tls.cert
   ls -la ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
   ```

4. **Teste conectividade gRPC**:
   ```bash
   lncli walletbalance
   lncli channelbalance
   ```

### Problemas com Lightning Addresses

- Certifique-se de que o servidor tem acesso à internet para resolver LNURL
- Verifique se o domínio da Lightning Address está funcionando
- Lightning Addresses requerem HTTPS para funcionar

### Erro de Autenticação

- Verifique se a chave secreta no header `x-secret-key` está correta
- Confirme se o IP está na lista `allowedIps` do `config.json`
- Para desenvolvimento local, adicione `"127.0.0.1"` aos IPs permitidos

### Arquivos de Log

Verifique os logs em `logs/payment-server.log` para detalhes sobre erros.

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
