#!/bin/bash

# Script avançado para gerenciamento de chaves secretas
# Suporta diferentes tipos de chaves e configurações

show_help() {
    echo "🔐 Gerenciador de Chaves Secretas - LND RPC Server"
    echo ""
    echo "Uso: $0 [OPÇÕES]"
    echo ""
    echo "Opções:"
    echo "  -h, --help          Mostrar esta ajuda"
    echo "  -g, --generate      Gerar nova chave (padrão: 64 caracteres)"
    echo "  -l, --length NUM    Tamanho da chave (8-128 caracteres)"
    echo "  -t, --type TYPE     Tipo de chave:"
    echo "                        hex     - Hexadecimal (padrão)"
    echo "                        alpha   - Alfanumérico"
    echo "                        secure  - Alfanumérico + símbolos"
    echo "  -s, --show          Mostrar chave atual"
    echo "  -b, --backup        Apenas fazer backup (sem gerar nova chave)"
    echo "  -r, --restore FILE  Restaurar de backup específico"
    echo "  --no-test-update    Não atualizar o script test.sh"
    echo "  --force             Não pedir confirmação"
    echo ""
    echo "Exemplos:"
    echo "  $0 -g                    # Gerar nova chave padrão"
    echo "  $0 -g -l 32 -t alpha     # Chave alfanumérica de 32 caracteres"
    echo "  $0 -s                    # Mostrar chave atual"
    echo "  $0 -r config_backup_20240720_143000.json  # Restaurar backup"
    echo ""
}

# Configurações padrão
CONFIG_FILE="config/config.json"
BACKUP_DIR="config/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
KEY_LENGTH=64
KEY_TYPE="hex"
UPDATE_TEST_SCRIPT=true
FORCE_MODE=false
GENERATE_NEW=false
SHOW_CURRENT=false
BACKUP_ONLY=false
RESTORE_FILE=""

# Processar argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -g|--generate)
            GENERATE_NEW=true
            shift
            ;;
        -l|--length)
            KEY_LENGTH="$2"
            if ! [[ "$KEY_LENGTH" =~ ^[0-9]+$ ]] || [ "$KEY_LENGTH" -lt 8 ] || [ "$KEY_LENGTH" -gt 128 ]; then
                echo "❌ Erro: Tamanho da chave deve ser entre 8 e 128 caracteres"
                exit 1
            fi
            shift 2
            ;;
        -t|--type)
            KEY_TYPE="$2"
            if [[ ! "$KEY_TYPE" =~ ^(hex|alpha|secure)$ ]]; then
                echo "❌ Erro: Tipo deve ser 'hex', 'alpha' ou 'secure'"
                exit 1
            fi
            shift 2
            ;;
        -s|--show)
            SHOW_CURRENT=true
            shift
            ;;
        -b|--backup)
            BACKUP_ONLY=true
            shift
            ;;
        -r|--restore)
            RESTORE_FILE="$2"
            shift 2
            ;;
        --no-test-update)
            UPDATE_TEST_SCRIPT=false
            shift
            ;;
        --force)
            FORCE_MODE=true
            shift
            ;;
        *)
            echo "❌ Erro: Opção desconhecida '$1'"
            echo "Use -h ou --help para ver as opções disponíveis"
            exit 1
            ;;
    esac
done

# Verificar se arquivo de configuração existe
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Erro: Arquivo $CONFIG_FILE não encontrado!"
    exit 1
fi

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Função para obter chave atual
get_current_key() {
    grep -o '"secretKey": "[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4
}

# Função para mostrar chave atual
show_current_key() {
    local current_key=$(get_current_key)
    if [ -n "$current_key" ]; then
        echo "🔒 Chave atual: $current_key"
        echo "   Tamanho: ${#current_key} caracteres"
        echo "   Primeiro/Último: ${current_key:0:8}...${current_key: -8}"
    else
        echo "❌ Erro: Não foi possível encontrar a chave atual"
        exit 1
    fi
}

# Função para gerar nova chave
generate_key() {
    local length=$1
    local type=$2
    local new_key=""
    
    case $type in
        "hex")
            # Chave hexadecimal
            new_key=$(openssl rand -hex $((length/2)) 2>/dev/null)
            if [ $? -ne 0 ]; then
                # Fallback se openssl não estiver disponível
                new_key=$(tr -dc 'a-f0-9' < /dev/urandom | head -c $length)
            fi
            ;;
        "alpha")
            # Chave alfanumérica
            new_key=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c $length)
            ;;
        "secure")
            # Chave com símbolos (mais segura)
            new_key=$(tr -dc 'a-zA-Z0-9@#$%^&*()_+-=[]{}|;:,.<>?' < /dev/urandom | head -c $length)
            ;;
    esac
    
    echo "$new_key"
}

# Função para fazer backup
make_backup() {
    local backup_file="$BACKUP_DIR/config_backup_$TIMESTAMP.json"
    cp "$CONFIG_FILE" "$backup_file"
    echo "✅ Backup salvo em: $backup_file"
}

# Função para restaurar backup
restore_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        # Tentar no diretório de backups
        if [ -f "$BACKUP_DIR/$backup_file" ]; then
            backup_file="$BACKUP_DIR/$backup_file"
        else
            echo "❌ Erro: Arquivo de backup '$backup_file' não encontrado!"
            exit 1
        fi
    fi
    
    echo "🔄 Restaurando configuração de: $backup_file"
    cp "$backup_file" "$CONFIG_FILE"
    echo "✅ Configuração restaurada com sucesso!"
}

# Função principal de execução
main() {
    echo "🔐 Gerenciador de Chaves Secretas - LND RPC Server"
    echo ""
    
    # Mostrar chave atual se solicitado
    if [ "$SHOW_CURRENT" = true ]; then
        show_current_key
        exit 0
    fi
    
    # Restaurar backup se solicitado
    if [ -n "$RESTORE_FILE" ]; then
        if [ "$FORCE_MODE" = false ]; then
            echo "⚠️  Você está prestes a restaurar a configuração de um backup."
            read -p "Deseja continuar? (y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Operação cancelada."
                exit 0
            fi
        fi
        make_backup
        restore_backup "$RESTORE_FILE"
        exit 0
    fi
    
    # Apenas fazer backup se solicitado
    if [ "$BACKUP_ONLY" = true ]; then
        make_backup
        exit 0
    fi
    
    # Gerar nova chave se solicitado
    if [ "$GENERATE_NEW" = true ]; then
        local current_key=$(get_current_key)
        
        echo "Configuração atual:"
        echo "   • Chave atual: ${current_key:0:16}...(truncada)"
        echo "   • Nova chave: $KEY_LENGTH caracteres, tipo '$KEY_TYPE'"
        echo ""
        
        if [ "$FORCE_MODE" = false ]; then
            read -p "Deseja continuar com a rotação da chave? (y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Operação cancelada."
                exit 0
            fi
        fi
        
        # Fazer backup
        make_backup
        
        # Gerar nova chave
        echo "🎲 Gerando nova chave secreta..."
        local new_key=$(generate_key $KEY_LENGTH $KEY_TYPE)
        
        if [ -z "$new_key" ]; then
            echo "❌ Erro: Falha ao gerar nova chave!"
            exit 1
        fi
        
        echo "🔑 Nova chave gerada: ${new_key:0:16}...(truncada para segurança)"
        
        # Atualizar config.json
        echo "📝 Atualizando arquivo de configuração..."
        sed -i.tmp "s/\"secretKey\": \"$current_key\"/\"secretKey\": \"$new_key\"/" "$CONFIG_FILE"
        
        # Verificar se a substituição foi bem-sucedida
        if grep -q "$new_key" "$CONFIG_FILE"; then
            echo "✅ Chave secreta atualizada com sucesso!"
            rm -f "${CONFIG_FILE}.tmp"
            
            # Atualizar script de teste se solicitado
            if [ "$UPDATE_TEST_SCRIPT" = true ] && [ -f "test.sh" ]; then
                echo "🧪 Atualizando chave no script de teste..."
                sed -i "s/SECRET_KEY=\"[^\"]*\"/SECRET_KEY=\"$new_key\"/" test.sh
                echo "✅ Script test.sh atualizado"
            fi
            
            # Mostrar informações
            echo ""
            echo "📋 Resumo da operação:"
            echo "   • Tipo: $KEY_TYPE"
            echo "   • Tamanho: $KEY_LENGTH caracteres"
            echo "   • Nova chave: $new_key"
            echo "   • Backup: $BACKUP_DIR/config_backup_$TIMESTAMP.json"
            echo ""
            
            # Verificar servidor
            if pgrep -f "node.*server.js" > /dev/null; then
                echo "⚠️  SERVIDOR RODANDO - Reinicialização necessária!"
                echo "   Execute: ./start.sh ou sudo systemctl restart lnd-rpc-js"
                echo ""
            fi
            
            echo "🎉 Rotação de chave concluída!"
            
        else
            echo "❌ Erro: Falha ao atualizar configuração!"
            echo "   Restaurando backup..."
            cp "$BACKUP_DIR/config_backup_$TIMESTAMP.json" "$CONFIG_FILE"
            rm -f "${CONFIG_FILE}.tmp"
            exit 1
        fi
        
    else
        echo "❌ Nenhuma ação especificada."
        echo "Use -h ou --help para ver as opções disponíveis"
        exit 1
    fi
}

# Executar função principal
main
