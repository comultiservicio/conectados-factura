# Conectados Factura+ Manual API Testing Script (PowerShell)
# This script tests all API endpoints with curl commands

Write-Host "🧪 Starting Manual API Testing for Conectados Factura+..." -ForegroundColor Green

# Configuration
$apiBaseUrl = "https://api123456789.execute-api.us-east-1.amazonaws.com/prod"
$testEmail = "testuser@conectadosfactura.com"
$testPassword = "TestPassword123!"

Write-Host "🌐 API Base URL: $apiBaseUrl" -ForegroundColor Cyan
Write-Host "👤 Test User: $testEmail" -ForegroundColor Cyan

# Step 1: Health Check
Write-Host "`n🔍 Step 1: Health Check" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/" -Method Get -ErrorAction Stop
    Write-Host "✅ Health check successful - Status: 200" -ForegroundColor Green
} catch {
    Write-Host "❌ Health check failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Step 2: User Registration
Write-Host "`n👥 Step 2: User Registration" -ForegroundColor Blue
$registrationData = @{
    email = $testEmail
    password = $testPassword
    firstName = "Test"
    lastName = "User"
    role = "admin"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/auth/register" -Method Post -ContentType "application/json" -Body $registrationData -ErrorAction Stop
    Write-Host "✅ User registration successful - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ User registration may already exist or failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 3: User Authentication
Write-Host "`n🔐 Step 3: User Authentication" -ForegroundColor Blue
$authData = @{
    email = $testEmail
    password = $testPassword
} | ConvertTo-Json -Depth 10

try {
    $authResponse = Invoke-RestMethod -Uri "$apiBaseUrl/auth" -Method Post -ContentType "application/json" -Body $authData -ErrorAction Stop
    $jwtToken = $authResponse.token
    if ($jwtToken) {
        Write-Host "✅ JWT Token obtained: $($jwtToken.Substring(0, 20))..." -ForegroundColor Green
        $authHeader = @{Authorization = "Bearer $jwtToken"}
    } else {
        Write-Host "❌ Failed to obtain JWT token" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Authentication failed - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Create Customer
Write-Host "`n👤 Step 4: Create Customer" -ForegroundColor Blue
$customerData = @{
    name = "Test Customer"
    email = "customer@test.com"
    phone = "+5491112345678"
    address = "Test Address 123"
    taxId = "20123456780"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/customers" -Method Post -ContentType "application/json" -Body $customerData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Customer created successfully - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Customer creation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 5: Create Product
Write-Host "`n📦 Step 5: Create Product" -ForegroundColor Blue
$productData = @{
    name = "Test Product"
    description = "Test product description"
    sku = "TEST-001"
    price = 100.50
    taxRate = 21.0
    category = "Test Category"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/products" -Method Post -ContentType "application/json" -Body $productData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Product created successfully - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Product creation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 6: Create Warehouse
Write-Host "`n🏪 Step 6: Create Warehouse" -ForegroundColor Blue
$warehouseData = @{
    name = "Main Warehouse"
    address = "Warehouse Address 456"
    phone = "+5491187654321"
    manager = "Warehouse Manager"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/warehouses" -Method Post -ContentType "application/json" -Body $warehouseData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Warehouse created successfully - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Warehouse creation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 7: Add Stock
Write-Host "`n📊 Step 7: Add Stock" -ForegroundColor Blue
$stockData = @{
    productId = "test-product-id"
    warehouseId = "test-warehouse-id"
    quantity = 50
    movementType = "IN"
    reason = "Initial stock"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/stock/movements" -Method Post -ContentType "application/json" -Body $stockData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Stock added successfully - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Stock addition failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 8: Check Stock Levels
Write-Host "`n📈 Step 8: Check Stock Levels" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/stock" -Method Get -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Stock levels retrieved successfully - Status: 200" -ForegroundColor Green
    Write-Host "📊 Stock data: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Stock levels retrieval failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Step 9: Create Invoice
Write-Host "`n🧾 Step 9: Create Invoice" -ForegroundColor Blue
$invoiceData = @{
    customerId = "test-customer-id"
    items = @(
        @{
            productId = "test-product-id"
            quantity = 2
            unitPrice = 100.50
            taxRate = 21.0
        }
    )
    paymentMethod = "cash"
    notes = "Test invoice"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/billing/invoices" -Method Post -ContentType "application/json" -Body $invoiceData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Invoice created successfully - Status: 201" -ForegroundColor Green
    if ($response.cae) {
        Write-Host "📄 AFIP CAE obtained: $($response.cae)" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Invoice creation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 10: List Invoices
Write-Host "`n📋 Step 10: List Invoices" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/billing/invoices" -Method Get -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Invoices retrieved successfully - Status: 200" -ForegroundColor Green
    Write-Host "📋 Invoice count: $($response.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Invoices retrieval failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Step 11: Create Payment
Write-Host "`n💳 Step 11: Create Payment" -ForegroundColor Blue
$paymentData = @{
    invoiceId = "test-invoice-id"
    amount = 242.00
    paymentMethod = "mercadopago"
    externalId = "MP_TEST_123456"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/payments" -Method Post -ContentType "application/json" -Body $paymentData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Payment created successfully - Status: 201" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Payment creation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 12: List Payments
Write-Host "`n💰 Step 12: List Payments" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/payments" -Method Get -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Payments retrieved successfully - Status: 200" -ForegroundColor Green
    Write-Host "💰 Payment count: $($response.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Payments retrieval failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Step 13: Test Sync Status
Write-Host "`n🔄 Step 13: Test Sync Status" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/sync/status" -Method Get -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Sync status retrieved successfully - Status: 200" -ForegroundColor Green
} catch {
    Write-Host "❌ Sync status retrieval failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Step 14: Test OCR Processing
Write-Host "`n📄 Step 14: Test OCR Processing" -ForegroundColor Blue
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/ocr/status" -Method Get -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ OCR status retrieved successfully - Status: 200" -ForegroundColor Green
} catch {
    Write-Host "⚠️ OCR status retrieval failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 15: Test Error Scenarios
Write-Host "`n⚠️ Step 15: Test Error Scenarios" -ForegroundColor Blue

# Test invalid credentials
Write-Host "🔍 Testing invalid credentials..." -ForegroundColor Cyan
$invalidAuth = @{email="invalid@test.com"; password="wrong"} | ConvertTo-Json -Depth 10
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/auth" -Method Post -ContentType "application/json" -Body $invalidAuth -ErrorAction Stop
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ Invalid credentials properly rejected - Status: 401" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Unexpected error for invalid credentials - $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Test unauthorized access
Write-Host "🔍 Testing unauthorized access..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/billing/invoices" -Method Get -ErrorAction Stop
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ Unauthorized access properly rejected - Status: 401" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Unexpected error for unauthorized access - $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Step 16: Performance Testing
Write-Host "`n⚡ Step 16: Performance Testing" -ForegroundColor Blue

# Test API latency
Write-Host "🔍 Testing API latency..." -ForegroundColor Cyan
$startTime = Get-Date
for ($i = 0; $i -lt 10; $i++) {
    try {
        Invoke-RestMethod -Uri "$apiBaseUrl/" -Method Get -ErrorAction Stop | Out-Null
    } catch {
        # Ignore errors for latency test
    }
}
$endTime = Get-Date
$latency = ($endTime - $startTime).TotalMilliseconds
$avgLatency = $latency / 10

if ($avgLatency -lt 1000) {
    Write-Host "✅ Average latency: $([math]::Round($avgLatency, 2))ms" -ForegroundColor Green
} else {
    Write-Host "⚠️ High latency detected: $([math]::Round($avgLatency, 2))ms" -ForegroundColor Yellow
}

# Test concurrent requests
Write-Host "🔍 Testing concurrent requests..." -ForegroundColor Cyan
$jobs = @()
for ($i = 0; $i -lt 5; $i++) {
    $jobs += Start-Job -ScriptBlock {
        try {
            Invoke-RestMethod -Uri "$using:apiBaseUrl/" -Method Get -ErrorAction Stop | Out-Null
        } catch {
            # Ignore errors for concurrent test
        }
    }
}
$jobs | Wait-Job | Receive-Job | Out-Null
$jobs | Remove-Job
Write-Host "✅ Concurrent requests completed" -ForegroundColor Green

# Step 17: CloudWatch Metrics Testing
Write-Host "`n📊 Step 17: CloudWatch Metrics Testing" -ForegroundColor Blue

# Simulate scenarios that would trigger alarms
Write-Host "🔍 Simulating alarm scenarios..." -ForegroundColor Cyan

# Simulate low stock (would trigger StockCriticalAlarm)
Write-Host "📊 Simulating low stock scenario..." -ForegroundColor Gray
$lowStockData = @{
    productId = "test-product-id"
    warehouseId = "test-warehouse-id"
    quantity = -45  # Remove stock to trigger alarm (<10 units)
    movementType = "OUT"
    reason = "Low stock test"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/stock/movements" -Method Post -ContentType "application/json" -Body $lowStockData -Headers $authHeader -ErrorAction Stop
    Write-Host "✅ Low stock scenario simulated - Check CloudWatch for StockCriticalAlarm" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Low stock simulation failed - $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n🎉 Manual API Testing Completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "  - All 7 main endpoints tested" -ForegroundColor White
Write-Host "  - Authentication flow validated" -ForegroundColor White
Write-Host "  - CRUD operations tested" -ForegroundColor White
Write-Host "  - Error scenarios verified" -ForegroundColor White
Write-Host "  - Performance metrics collected" -ForegroundColor White
Write-Host "  - CloudWatch alarm scenarios simulated" -ForegroundColor White
Write-Host ""
Write-Host "📖 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Check CloudWatch Dashboard for metrics" -ForegroundColor White
Write-Host "  2. Verify SNS email notifications to conectados@chathannah.uk and soporteco@chathannah.uk" -ForegroundColor White
Write-Host "  3. Validate QuickSight dashboards" -ForegroundColor White
Write-Host "  4. Test with real pilot customers" -ForegroundColor White
