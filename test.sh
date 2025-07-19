#!/bin/bash

# Script de teste para o servidor de pagamentos
# Testa todas as funcionalidades básicas

echo "🧪 Testando servidor de pagamentos..."

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
        curl -s -X $method -H "Content-Type: application/json" -H "x-secret-key: $SECRET_KEY" -d "$data" "$SERVER_URL$endpoint"
    fi
}

# Verificar se servidor está rodando
echo "🔍 Verificando se servidor está rodando..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5002)
if [ "$response" != "404" ] && [ "$response" != "403" ]; then
    echo "✅ Servidor está rodando"
else
    echo "❌ Servidor não está rodando. Execute './start.sh' primeiro."
    exit 1
fi

echo ""
echo "💰 Testando consulta de saldos..."

# Testar saldo Bitcoin
echo "📊 Saldo Bitcoin:"
make_request GET "/balance/bitcoin" | jq . 2>/dev/null || echo "Erro ao consultar saldo Bitcoin"

echo ""
# Testar saldo Lightning
echo "📊 Saldo Lightning:"
make_request GET "/balance/lightning" | jq . 2>/dev/null || echo "Erro ao consultar saldo Lightning"

echo ""
# Testar saldo Liquid
echo "📊 Saldo Liquid:"
make_request GET "/balance/liquid" | jq . 2>/dev/null || echo "Erro ao consultar saldo Liquid"

echo ""
echo "📋 Testando listagem de pagamentos..."

# Listar pagamentos pendentes
echo "⏳ Pagamentos pendentes:"
make_request GET "/pending" | jq . 2>/dev/null || echo "Erro ao listar pagamentos pendentes"

echo ""
# Listar pagamentos enviados
echo "✅ Pagamentos enviados:"
make_request GET "/sent" | jq . 2>/dev/null || echo "Erro ao listar pagamentos enviados"

echo ""
echo "💸 Testando envio de pagamento (simulação)..."

# Dados de teste
test_payment='{
  "transactionId": "test_'$(date +%s)'",
  "username": "teste_usuario",
  "amount": 1000,
  "network": "lightning",
  "destinationWallet": "test@example.com"
}'

echo "📤 Enviando pagamento de teste:"
echo "$test_payment" | jq .

response=$(make_request POST "/payment" "$test_payment")
echo "📥 Resposta:"
echo "$response" | jq . 2>/dev/null || echo "$response"

echo ""
echo "🏁 Teste concluído!"
echo ""
echo "📝 Para testar com dados reais:"
echo "1. Configure suas credenciais RPC em config/config.json"
echo "2. Use endereços/invoices válidos"
echo "3. Verifique se os nós estão sincronizados e com saldo"
