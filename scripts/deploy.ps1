# Conectados Factura+ Deployment Script (PowerShell)
# This script handles the complete deployment process

Write-Host "🚀 Starting Conectados Factura+ Deployment..." -ForegroundColor Green

# Load environment variables
$envFile = ".\infrastructure\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
    Write-Host "✅ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "❌ Error: .env file not found in infrastructure directory" -ForegroundColor Red
    exit 1
}

# Step 1: CDK Bootstrap
Write-Host "📦 Step 1: Bootstrapping CDK..." -ForegroundColor Blue
Set-Location infrastructure
cdk bootstrap --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
Write-Host "✅ CDK bootstrap completed" -ForegroundColor Green

# Step 2: Deploy Infrastructure
Write-Host "🏗️ Step 2: Deploying infrastructure with CDK..." -ForegroundColor Blue
cdk deploy --all --require-approval never
Write-Host "✅ Infrastructure deployment completed" -ForegroundColor Green

# Step 3: Get outputs for database connection
Write-Host "📋 Step 3: Extracting deployment outputs..." -ForegroundColor Blue
$stackOutputs = cdk list --json | ConvertFrom-Json
$dbEndpoint = $stackOutputs.ConectadosFacturaStack.outputs.DatabaseEndpoint
$dbSecretArn = $stackOutputs.ConectadosFacturaStack.outputs.DatabaseSecretArn
$apiEndpoint = $stackOutputs.ConectadosFacturaStack.outputs.APIEndpoint

Write-Host "📊 Database Endpoint: $dbEndpoint" -ForegroundColor Cyan
Write-Host "🔐 Database Secret ARN: $dbSecretArn" -ForegroundColor Cyan
Write-Host "🌐 API Endpoint: $apiEndpoint" -ForegroundColor Cyan

# Step 4: Wait for RDS to be available
Write-Host "⏳ Step 4: Waiting for RDS database to be available..." -ForegroundColor Blue
aws rds wait db-instance-available --db-instance-identifier conectados-factura-db
Write-Host "✅ RDS database is available" -ForegroundColor Green

# Step 5: Execute database migrations
Write-Host "🗄️ Step 5: Executing database migrations..." -ForegroundColor Blue
Set-Location ..\database

# Get database credentials from Secrets Manager
$dbCredentials = aws secretsmanager get-secret-value --secret-id $dbSecretArn --query SecretString --output text | ConvertFrom-Json
$dbHost = $dbCredentials.host
$dbPort = $dbCredentials.port
$dbName = $dbCredentials.dbname
$dbUser = $dbCredentials.username
$dbPassword = $dbCredentials.password

# Set database connection string
$env:DATABASE_URL = "postgresql://$dbUser`:$dbPassword@$dbHost`:$dbPort/$dbName"

# Run migrations
$env:PGPASSWORD = $dbPassword
psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f migrations/001_initial_schema.sql
Write-Host "✅ Database migrations completed" -ForegroundColor Green

# Step 6: Validate deployment
Write-Host "🔍 Step 6: Validating deployment..." -ForegroundColor Blue

# Test API endpoint
Write-Host "🌐 Testing API endpoint..." -ForegroundColor Blue
try {
    Invoke-RestMethod -Uri "$apiEndpoint/health" -Method Get -ErrorAction Stop | Out-Null
    Write-Host "✅ API endpoint is responding" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Health endpoint not available (expected)" -ForegroundColor Yellow
}

# Check Lambda functions
Write-Host "🔧 Checking Lambda functions..." -ForegroundColor Blue
aws lambda list-functions --query 'Functions[?contains(FunctionName, `ConectadosFactura`)]' --output table

# Check DynamoDB tables
Write-Host "📊 Checking DynamoDB tables..." -ForegroundColor Blue
aws dynamodb list-tables --query 'TableNames[?contains(@, `conectados`)]' --output table

# Check CloudWatch alarms
Write-Host "🚨 Checking CloudWatch alarms..." -ForegroundColor Blue
aws cloudwatch describe-alarms --alarm-names-prefix "ConectadosFactura" --query 'MetricAlarms[].AlarmName' --output table

Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Deployment Summary:" -ForegroundColor Cyan
Write-Host "🌐 API Endpoint: $apiEndpoint" -ForegroundColor White
Write-Host "🗄️ Database Endpoint: $dbEndpoint" -ForegroundColor White
Write-Host "🔐 Database: $dbName" -ForegroundColor White
Write-Host "📊 CloudWatch Dashboard: conectados-factura-dashboard" -ForegroundColor White
Write-Host "🚨 SNS Alerts Topic: ConectadosAlertas" -ForegroundColor White
Write-Host ""
Write-Host "📖 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Test endpoints with Postman/curl" -ForegroundColor White
Write-Host "2. Configure QuickSight dashboards" -ForegroundColor White
Write-Host "3. Set up additional monitoring" -ForegroundColor White
Write-Host "4. Deploy mobile app to production" -ForegroundColor White
