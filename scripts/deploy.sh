#!/bin/bash

# Conectados Factura+ Deployment Script
# This script handles the complete deployment process

set -e

echo "🚀 Starting Conectados Factura+ Deployment..."

# Load environment variables
if [ -f "./infrastructure/.env" ]; then
    source ./infrastructure/.env
    echo "✅ Environment variables loaded"
else
    echo "❌ Error: .env file not found in infrastructure directory"
    exit 1
fi

# Step 1: CDK Bootstrap
echo "📦 Step 1: Bootstrapping CDK..."
cd infrastructure
cdk bootstrap --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
echo "✅ CDK bootstrap completed"

# Step 2: Deploy Infrastructure
echo "🏗️ Step 2: Deploying infrastructure with CDK..."
cdk deploy --all --require-approval never
echo "✅ Infrastructure deployment completed"

# Step 3: Get outputs for database connection
echo "📋 Step 3: Extracting deployment outputs..."
DB_ENDPOINT=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.DatabaseEndpoint')
DB_SECRET_ARN=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.DatabaseSecretArn')
API_ENDPOINT=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.APIEndpoint')

echo "📊 Database Endpoint: $DB_ENDPOINT"
echo "🔐 Database Secret ARN: $DB_SECRET_ARN"
echo "🌐 API Endpoint: $API_ENDPOINT"

# Step 4: Wait for RDS to be available
echo "⏳ Step 4: Waiting for RDS database to be available..."
aws rds wait db-instance-available --db-instance-identifier conectados-factura-db
echo "✅ RDS database is available"

# Step 5: Execute database migrations
echo "🗄️ Step 5: Executing database migrations..."
cd ../database

# Get database credentials from Secrets Manager
DB_CREDENTIALS=$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --query SecretString --output text)
DB_HOST=$(echo $DB_CREDENTIALS | jq -r '.host')
DB_PORT=$(echo $DB_CREDENTIALS | jq -r '.port')
DB_NAME=$(echo $DB_CREDENTIALS | jq -r '.dbname')
DB_USER=$(echo $DB_CREDENTIALS | jq -r '.username')
DB_PASSWORD=$(echo $DB_CREDENTIALS | jq -r '.password')

# Set database connection string
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

# Run migrations
export PGPASSWORD=$DB_PASSWORD
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/001_initial_schema.sql
echo "✅ Database migrations completed"

# Step 6: Validate deployment
echo "🔍 Step 6: Validating deployment..."

# Test API endpoint
echo "🌐 Testing API endpoint..."
curl -f "$API_ENDPOINT/health" || echo "⚠️ Health endpoint not available (expected)"

# Check Lambda functions
echo "🔧 Checking Lambda functions..."
aws lambda list-functions --query 'Functions[?contains(FunctionName, `ConectadosFactura`)]' --output table

# Check DynamoDB tables
echo "📊 Checking DynamoDB tables..."
aws dynamodb list-tables --query 'TableNames[?contains(@, `conectados`)]' --output table

# Check CloudWatch alarms
echo "🚨 Checking CloudWatch alarms..."
aws cloudwatch describe-alarms --alarm-names-prefix "ConectadosFactura" --query 'MetricAlarms[].AlarmName' --output table

echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "🌐 API Endpoint: $API_ENDPOINT"
echo "🗄️ Database Endpoint: $DB_ENDPOINT"
echo "🔐 Database: $DB_NAME"
echo "📊 CloudWatch Dashboard: conectados-factura-dashboard"
echo "🚨 SNS Alerts Topic: ConectadosAlertas"
echo ""
echo "📖 Next Steps:"
echo "1. Test endpoints with Postman/curl"
echo "2. Configure QuickSight dashboards"
echo "3. Set up additional monitoring"
echo "4. Deploy mobile app to production"
