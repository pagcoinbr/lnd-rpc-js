#!/bin/bash

# Script para rotação de chave secreta
# Gera uma nova chave aleatória e atualiza o config.json

echo "🔐 Rotacionando chave secreta do servidor..."

# Configurações
CONFIG_FILE="config/config.json"
BACKUP_DIR="config/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Verificar se arquivo de configuração existe
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Erro: Arquivo $CONFIG_FILE não encontrado!"
    exit 1
fi

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Fazer backup do config atual
echo "📁 Criando backup do config atual..."
cp "$CONFIG_FILE" "$BACKUP_DIR/config_backup_$TIMESTAMP.json"
echo "✅ Backup salvo em: $BACKUP_DIR/config_backup_$TIMESTAMP.json"

# Gerar nova chave secreta (64 caracteres aleatórios)
echo "🎲 Gerando nova chave secreta..."
NEW_SECRET_KEY=$(openssl rand -hex 32)

# Verificar se openssl está disponível
if [ $? -ne 0 ]; then
    echo "⚠️  openssl não encontrado, usando método alternativo..."
    # Método alternativo usando /dev/urandom
    NEW_SECRET_KEY=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 64)
fi

echo "🔑 Nova chave gerada: ${NEW_SECRET_KEY:0:16}...(truncada para segurança)"

# Obter a chave atual para comparação
CURRENT_KEY=$(grep -o '"secretKey": "[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
echo "🔒 Chave atual: ${CURRENT_KEY:0:16}...(truncada para segurança)"

# Atualizar o config.json usando sed
echo "📝 Atualizando arquivo de configuração..."

# Usar sed para substituir a chave secreta
sed -i.bak "s/\"secretKey\": \"$CURRENT_KEY\"/\"secretKey\": \"$NEW_SECRET_KEY\"/" "$CONFIG_FILE"

# Verificar se a substituição foi bem-sucedida
if grep -q "$NEW_SECRET_KEY" "$CONFIG_FILE"; then
    echo "✅ Chave secreta atualizada com sucesso!"
    
    # Remover arquivo .bak criado pelo sed
    rm -f "${CONFIG_FILE}.bak"
    
    # Mostrar informações da nova configuração
    echo ""
    echo "📋 Resumo da operação:"
    echo "   • Backup salvo em: $BACKUP_DIR/config_backup_$TIMESTAMP.json"
    echo "   • Nova chave: $NEW_SECRET_KEY"
    echo "   • Arquivo atualizado: $CONFIG_FILE"
    echo ""
    
    # Verificar se o servidor está rodando
    if pgrep -f "node.*server.js" > /dev/null; then
        echo "⚠️  ATENÇÃO: O servidor está rodando!"
        echo "   Para que a nova chave seja aplicada, você precisa reiniciar o servidor:"
        echo "   1. Pare o servidor atual (Ctrl+C ou kill)"
        echo "   2. Execute: ./start.sh"
        echo "   3. Ou use: sudo systemctl restart lnd-rpc-js (se usando como serviço)"
        echo ""
    fi
    
    # Mostrar exemplo de uso da nova chave
    echo "🔧 Para testar a nova chave:"
    echo "   curl -H \"x-secret-key: $NEW_SECRET_KEY\" http://localhost:5002/balance/bitcoin"
    echo ""
    
    # Atualizar arquivo de teste se existir
    if [ -f "test.sh" ]; then
        echo "🧪 Atualizando chave no script de teste..."
        sed -i "s/SECRET_KEY=\"[^\"]*\"/SECRET_KEY=\"$NEW_SECRET_KEY\"/" test.sh
        echo "✅ Script test.sh atualizado com a nova chave"
    fi
    
else
    echo "❌ Erro: Falha ao atualizar a chave secreta!"
    echo "   Restaurando backup..."
    cp "$BACKUP_DIR/config_backup_$TIMESTAMP.json" "$CONFIG_FILE"
    echo "✅ Configuração restaurada do backup"
    exit 1
fi

echo ""
echo "🎉 Rotação de chave concluída com sucesso!"
echo "   Lembre-se de atualizar todos os clientes que usam este servidor"
echo "   com a nova chave secreta."
