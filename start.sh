#!/bin/bash

# Script de inicialização do servidor de pagamentos
# Verifica dependências e inicia o servidor

echo "🚀 Iniciando servidor de pagamentos multi-chain..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale Node.js primeiro."
    exit 1
fi

# Verificar se npm está instalado  
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Por favor, instale npm primeiro."
    exit 1
fi

# Ir para o diretório do projeto
cd "$(dirname "$0")"

# Instalar dependências se node_modules não existir
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Verificar se arquivo de configuração existe
if [ ! -f "config/config.json" ]; then
    echo "❌ Arquivo de configuração não encontrado em config/config.json"
    echo "Por favor, configure suas credenciais RPC antes de continuar."
    exit 1
fi

# Criar diretórios necessários se não existirem
mkdir -p payment_req
mkdir -p payment_sent  
mkdir -p logs
mkdir -p proto

# Verificar se lightning.proto existe
if [ ! -f "proto/lightning.proto" ]; then
    echo "⚠️  Arquivo lightning.proto não encontrado."
    echo "Baixando lightning.proto do repositório oficial..."
    
    if command -v curl &> /dev/null; then
        curl -o proto/lightning.proto https://raw.githubusercontent.com/lightningnetwork/lnd/master/lnrpc/lightning.proto
        echo "✅ lightning.proto baixado com sucesso!"
    elif command -v wget &> /dev/null; then
        wget -O proto/lightning.proto https://raw.githubusercontent.com/lightningnetwork/lnd/master/lnrpc/lightning.proto
        echo "✅ lightning.proto baixado com sucesso!"
    else
        echo "❌ curl ou wget não encontrados. Por favor, baixe manualmente:"
        echo "https://raw.githubusercontent.com/lightningnetwork/lnd/master/lnrpc/lightning.proto"
        echo "E salve em proto/lightning.proto"
        exit 1
    fi
fi

# Verificar conectividade com os nós
echo "🔍 Verificando conectividade com os nós..."

# Função para verificar se uma porta está aberta
check_port() {
    local host=$1
    local port=$2
    local service=$3
    
    if timeout 3 bash -c "</dev/tcp/$host/$port"; then
        echo "✅ $service ($host:$port) - OK"
        return 0
    else
        echo "❌ $service ($host:$port) - Não acessível"
        return 1
    fi
}

# Ler configurações do arquivo JSON
CONFIG_FILE="config/config.json"

# Extrair configurações usando node
LIGHTNING_HOST=$(node -e "console.log(require('./config/config.json').lightning.host.split(':')[0])")
LIGHTNING_PORT=$(node -e "console.log(require('./config/config.json').lightning.host.split(':')[1])")
LIQUID_HOST=$(node -e "console.log(require('./config/config.json').liquid.rpcHost)")
LIQUID_PORT=$(node -e "console.log(require('./config/config.json').liquid.rpcPort)")

# Verificar conectividade
check_port $LIGHTNING_HOST $LIGHTNING_PORT "Lightning (LND)"
check_port $LIQUID_HOST $LIQUID_PORT "Liquid/Elements"

echo ""
echo "🎯 Iniciando servidor na porta 5002..."
echo "📝 Logs serão salvos em logs/payment-server.log"
echo "🔑 Certifique-se de usar a chave secreta correta no header 'x-secret-key'"
echo ""
echo "💡 Para configurar como serviço systemd (recomendado para produção):"
echo "   sudo ./service.sh install"
echo "   sudo ./service.sh start"
echo ""

# Verificar se foi passado argumento para instalar como serviço
if [ "$1" = "--service" ] || [ "$1" = "-s" ]; then
    echo "🔧 Configurando como serviço systemd..."
    if [ "$EUID" -eq 0 ]; then
        ./service.sh install
        ./service.sh start
        echo "✅ Serviço configurado! Use 'sudo systemctl status lnd-rpc-js' para verificar"
        exit 0
    else
        echo "❌ Para configurar como serviço, execute: sudo $0 --service"
        exit 1
    fi
fi

# Iniciar servidor
node src/server.js
