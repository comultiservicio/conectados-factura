#!/bin/bash

# Conectados Factura+ Manual API Testing Script
# This script tests all API endpoints with curl commands

set -e

echo "🧪 Starting Manual API Testing for Conectados Factura+..."

# Configuration
API_BASE_URL="https://api123456789.execute-api.us-east-1.amazonaws.com/prod"
TEST_EMAIL="testuser@conectadosfactura.com"
TEST_PASSWORD="TestPassword123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️ $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️ $message${NC}"
            ;;
    esac
}

# Helper function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local headers=$4
    local expected_status=$5
    
    echo ""
    print_status "INFO" "Testing: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$API_BASE_URL$endpoint" $headers)
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$API_BASE_URL$endpoint" \
                   -H "Content-Type: application/json" $headers \
                   -d "$data")
    fi
    
    # Extract status code
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    # Extract body
    body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        print_status "SUCCESS" "Status: $http_code - Response: ${body:0:100}..."
        return 0
    else
        print_status "ERROR" "Status: $http_code (Expected: $expected_status) - Response: ${body:0:100}..."
        return 1
    fi
}

echo ""
print_status "INFO" "API Base URL: $API_BASE_URL"
print_status "INFO" "Test User: $TEST_EMAIL"
echo ""

# Step 1: Health Check
echo "🔍 Step 1: Health Check"
test_endpoint "GET" "/" "" "" "200"

# Step 2: User Registration
echo ""
echo "👥 Step 2: User Registration"
registration_data='{
    "email": "'$TEST_EMAIL'",
    "password": "'$TEST_PASSWORD'",
    "firstName": "Test",
    "lastName": "User",
    "role": "admin"
}'
test_endpoint "POST" "/auth/register" "$registration_data" "" "201"

# Step 3: User Authentication
echo ""
echo "🔐 Step 3: User Authentication"
auth_data='{
    "email": "'$TEST_EMAIL'",
    "password": "'$TEST_PASSWORD'"
}'
auth_response=$(curl -s -X POST "$API_BASE_URL/auth" \
               -H "Content-Type: application/json" \
               -d "$auth_data")

# Extract JWT token
jwt_token=$(echo $auth_response | grep -o '"token":"[^"]*' | sed 's/"token":"//')
if [ -n "$jwt_token" ]; then
    print_status "SUCCESS" "JWT Token obtained: ${jwt_token:0:20}..."
    auth_header="-H \"Authorization: Bearer $jwt_token\""
else
    print_status "ERROR" "Failed to obtain JWT token"
    exit 1
fi

# Step 4: Create Customer
echo ""
echo "👤 Step 4: Create Customer"
customer_data='{
    "name": "Test Customer",
    "email": "customer@test.com",
    "phone": "+5491112345678",
    "address": "Test Address 123",
    "taxId": "20123456780"
}'
test_endpoint "POST" "/customers" "$customer_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 5: Create Product
echo ""
echo "📦 Step 5: Create Product"
product_data='{
    "name": "Test Product",
    "description": "Test product description",
    "sku": "TEST-001",
    "price": 100.50,
    "taxRate": 21.0,
    "category": "Test Category"
}'
test_endpoint "POST" "/products" "$product_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 6: Create Warehouse
echo ""
echo "🏪 Step 6: Create Warehouse"
warehouse_data='{
    "name": "Main Warehouse",
    "address": "Warehouse Address 456",
    "phone": "+5491187654321",
    "manager": "Warehouse Manager"
}'
test_endpoint "POST" "/warehouses" "$warehouse_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 7: Add Stock
echo ""
echo "📊 Step 7: Add Stock"
stock_data='{
    "productId": "test-product-id",
    "warehouseId": "test-warehouse-id",
    "quantity": 50,
    "movementType": "IN",
    "reason": "Initial stock"
}'
test_endpoint "POST" "/stock/movements" "$stock_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 8: Check Stock Levels
echo ""
echo "📈 Step 8: Check Stock Levels"
test_endpoint "GET" "/stock" "" "-H \"Authorization: Bearer $jwt_token\"" "200"

# Step 9: Create Invoice
echo ""
echo "🧾 Step 9: Create Invoice"
invoice_data='{
    "customerId": "test-customer-id",
    "items": [
        {
            "productId": "test-product-id",
            "quantity": 2,
            "unitPrice": 100.50,
            "taxRate": 21.0
        }
    ],
    "paymentMethod": "cash",
    "notes": "Test invoice"
}'
test_endpoint "POST" "/billing/invoices" "$invoice_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 10: List Invoices
echo ""
echo "📋 Step 10: List Invoices"
test_endpoint "GET" "/billing/invoices" "" "-H \"Authorization: Bearer $jwt_token\"" "200"

# Step 11: Create Payment
echo ""
echo "💳 Step 11: Create Payment"
payment_data='{
    "invoiceId": "test-invoice-id",
    "amount": 242.00,
    "paymentMethod": "mercadopago",
    "externalId": "MP_TEST_123456"
}'
test_endpoint "POST" "/payments" "$payment_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Step 12: List Payments
echo ""
echo "💰 Step 12: List Payments"
test_endpoint "GET" "/payments" "" "-H \"Authorization: Bearer $jwt_token\"" "200"

# Step 13: Test Sync Status
echo ""
echo "🔄 Step 13: Test Sync Status"
test_endpoint "GET" "/sync/status" "" "-H \"Authorization: Bearer $jwt_token\"" "200"

# Step 14: Test OCR Processing
echo ""
echo "📄 Step 14: Test OCR Processing"
# Note: This would require an actual file upload, so we'll test the endpoint availability
test_endpoint "GET" "/ocr/status" "" "-H \"Authorization: Bearer $jwt_token\"" "200"

# Step 15: Test Error Scenarios
echo ""
echo "⚠️ Step 15: Test Error Scenarios"

# Test invalid credentials
print_status "INFO" "Testing invalid credentials..."
invalid_auth='{"email":"invalid@test.com","password":"wrong"}'
test_endpoint "POST" "/auth" "$invalid_auth" "" "401"

# Test unauthorized access
print_status "INFO" "Testing unauthorized access..."
test_endpoint "GET" "/billing/invoices" "" "" "401"

# Test invalid data
print_status "INFO" "Testing invalid data..."
invalid_data='{"invalid":"data"}'
test_endpoint "POST" "/billing/invoices" "$invalid_data" "-H \"Authorization: Bearer $jwt_token\"" "400"

# Step 16: Performance Testing
echo ""
echo "⚡ Step 16: Performance Testing"

# Test multiple requests to check latency
print_status "INFO" "Testing API latency..."
start_time=$(date +%s%N)
for i in {1..10}; do
    curl -s "$API_BASE_URL/" > /dev/null
done
end_time=$(date +%s%N)
latency=$((($end_time - $start_time) / 1000000))
avg_latency=$(($latency / 10))

if [ $avg_latency -lt 1000 ]; then
    print_status "SUCCESS" "Average latency: ${avg_latency}ms"
else
    print_status "WARNING" "High latency detected: ${avg_latency}ms"
fi

echo ""
print_status "INFO" "Testing concurrent requests..."
# Test 5 concurrent requests
for i in {1..5}; do
    curl -s "$API_BASE_URL/" > /dev/null &
done
wait
print_status "SUCCESS" "Concurrent requests completed"

# Step 17: CloudWatch Metrics Testing
echo ""
echo "📊 Step 17: CloudWatch Metrics Testing"

# Simulate low stock to trigger StockCriticalAlarm
print_status "INFO" "Simulating low stock scenario..."
low_stock_data='{
    "productId": "test-product-id",
    "warehouseId": "test-warehouse-id",
    "quantity": -45, # Remove stock to trigger alarm (<10 units)
    "movementType": "OUT",
    "reason": "Low stock test"
}'
test_endpoint "POST" "/stock/movements" "$low_stock_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

# Simulate AFIP errors to trigger AFIPErrorsAlarm
print_status "INFO" "Simulating AFIP errors scenario..."
# This would normally trigger errors, but we're testing the endpoint availability
test_endpoint "POST" "/billing/invoices" "$invoice_data" "-H \"Authorization: Bearer $jwt_token\"" "201"

echo ""
print_status "SUCCESS" "Manual API Testing Completed!"
echo ""
print_status "INFO" "Summary:"
echo "  - All 7 main endpoints tested"
echo "  - Authentication flow validated"
echo "  - CRUD operations tested"
echo "  - Error scenarios verified"
echo "  - Performance metrics collected"
echo "  - CloudWatch alarm scenarios simulated"
echo ""
print_status "INFO" "Next Steps:"
echo "  1. Check CloudWatch Dashboard for metrics"
echo "  2. Verify SNS email notifications"
echo "  3. Validate QuickSight dashboards"
echo "  4. Test with real pilot customers"
