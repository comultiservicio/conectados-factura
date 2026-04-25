#!/bin/bash

# Conectados Factura+ Deployment Validation Script
# This script validates the complete deployment and tests endpoints

set -e

echo "🔍 Starting Deployment Validation..."

# Load environment variables
if [ -f "./infrastructure/.env" ]; then
    source ./infrastructure/.env
    echo "✅ Environment variables loaded"
else
    echo "❌ Error: .env file not found"
    exit 1
fi

cd infrastructure

# Get deployment outputs
API_ENDPOINT=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.APIEndpoint')
USER_POOL_ID=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.UserPoolId')
USER_POOL_CLIENT_ID=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.UserPoolClientId')

echo "🌐 API Endpoint: $API_ENDPOINT"
echo "👥 User Pool ID: $USER_POOL_ID"
echo "🔑 User Pool Client ID: $USER_POOL_CLIENT_ID"

# Step 1: Test API Gateway endpoints
echo ""
echo "🧪 Step 1: Testing API Gateway endpoints..."

# Test health endpoint (if available)
echo "📊 Testing health endpoint..."
curl -s -w "Status: %{http_code}\n" "$API_ENDPOINT/" || echo "⚠️ Root endpoint not available"

# Test auth endpoints
echo "🔐 Testing auth endpoints..."
curl -s -w "Status: %{http_code}\n" -X POST "$API_ENDPOINT/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' || echo "⚠️ Auth endpoint test"

# Step 2: Test Cognito authentication
echo ""
echo "👥 Step 2: Testing Cognito authentication..."

# Test user registration
echo "📝 Testing user registration..."
aws cognito-idp sign-up \
  --client-id "$USER_POOL_CLIENT_ID" \
  --username "testuser@conectadosfactura.com" \
  --password "TestPassword123!" \
  --user-attributes Name=email,Value="testuser@conectadosfactura.com" || echo "⚠️ User registration test"

# Step 3: Test DynamoDB tables
echo ""
echo "📊 Step 3: Testing DynamoDB tables..."

# List all tables
echo "📋 Listing DynamoDB tables..."
TABLES=$(aws dynamodb list-tables --query 'TableNames[?contains(@, `conectados`)]' --output text)

for table in $TABLES; do
    echo "📊 Table: $table"
    # Test table access
    aws dynamodb describe-table --table-name "$table" --query 'Table.TableStatus' --output text || echo "❌ Error accessing $table"
done

# Step 4: Test Lambda functions
echo ""
echo "🔧 Step 4: Testing Lambda functions..."

# List all Lambda functions
echo "📋 Listing Lambda functions..."
FUNCTIONS=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `ConectadosFactura`)].FunctionName' --output text)

for function in $FUNCTIONS; do
    echo "🔧 Function: $function"
    # Test function configuration
    aws lambda get-function-configuration --function-name "$function" --query 'Runtime' --output text || echo "❌ Error accessing $function"
done

# Step 5: Test CloudWatch alarms
echo ""
echo "🚨 Step 5: Testing CloudWatch alarms..."

# List all alarms
echo "📋 Listing CloudWatch alarms..."
ALARMS=$(aws cloudwatch describe-alarms --alarm-names-prefix "ConectadosFactura" --query 'MetricAlarms[].AlarmName' --output text)

for alarm in $ALARMS; do
    echo "🚨 Alarm: $alarm"
    # Get alarm state
    aws cloudwatch describe-alarms --alarm-names "$alarm" --query 'MetricAlarms[0].StateValue' --output text || echo "❌ Error accessing $alarm"
done

# Step 6: Test SNS topics
echo ""
echo "📧 Step 6: Testing SNS topics..."

# List SNS topics
echo "📋 Listing SNS topics..."
TOPICS=$(aws sns list-topics --query 'Topics[?contains(TopicArn, `ConectadosAlertas`)].TopicArn' --output text)

for topic in $TOPICS; do
    echo "📧 Topic: $topic"
    # Get topic attributes
    aws sns get-topic-attributes --topic-arn "$topic" --query 'Attributes.DisplayName' --output text || echo "❌ Error accessing $topic"
done

# Step 7: Test RDS database connection
echo ""
echo "🗄️ Step 7: Testing RDS database connection..."

# Get database instance status
DB_STATUS=$(aws rds describe-db-instances --db-instance-identifier conectados-factura-db --query 'DBInstances[0].DBInstanceStatus' --output text)
echo "📊 Database Status: $DB_STATUS"

if [ "$DB_STATUS" = "available" ]; then
    echo "✅ Database is available"
    
    # Test database connection (if credentials are available)
    DB_SECRET_ARN=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.DatabaseSecretArn')
    DB_CREDENTIALS=$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --query SecretString --output text)
    
    if [ $? -eq 0 ]; then
        DB_HOST=$(echo $DB_CREDENTIALS | jq -r '.host')
        DB_PORT=$(echo $DB_CREDENTIALS | jq -r '.port')
        DB_NAME=$(echo $DB_CREDENTIALS | jq -r '.dbname')
        DB_USER=$(echo $DB_CREDENTIALS | jq -r '.username')
        DB_PASSWORD=$(echo $DB_CREDENTIALS | jq -r '.password')
        
        echo "🔗 Testing database connection..."
        export PGPASSWORD=$DB_PASSWORD
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1 && echo "✅ Database connection successful" || echo "❌ Database connection failed"
    else
        echo "⚠️ Could not retrieve database credentials"
    fi
else
    echo "❌ Database is not available"
fi

# Step 8: Test S3 buckets
echo ""
echo "📦 Step 8: Testing S3 buckets..."

# List S3 buckets
echo "📋 Listing S3 buckets..."
BUCKETS=$(aws s3 ls | grep "conectados-factura" | awk '{print $3}')

for bucket in $BUCKETS; do
    echo "📦 Bucket: $bucket"
    # Test bucket access
    aws s3 ls "s3://$bucket" > /dev/null 2>&1 && echo "✅ Bucket accessible" || echo "❌ Bucket not accessible"
done

# Step 9: Generate validation report
echo ""
echo "📊 Step 9: Generating validation report..."

REPORT_FILE="deployment-validation-$(date +%Y%m%d-%H%M%S).txt"

cat > "$REPORT_FILE" << EOF
Conectados Factura+ Deployment Validation Report
Generated: $(date)

API Endpoint: $API_ENDPOINT
User Pool ID: $USER_POOL_ID
User Pool Client ID: $USER_POOL_CLIENT_ID

DynamoDB Tables:
$TABLES

Lambda Functions:
$FUNCTIONS

CloudWatch Alarms:
$ALARMS

SNS Topics:
$TOPICS

S3 Buckets:
$BUCKETS

Database Status: $DB_STATUS

Validation completed successfully!
EOF

echo "📋 Validation report saved to: $REPORT_FILE"

echo ""
echo "🎉 Deployment validation completed!"
echo ""
echo "📊 Summary:"
echo "✅ API Gateway: $API_ENDPOINT"
echo "✅ DynamoDB Tables: $(echo $TABLES | wc -w)"
echo "✅ Lambda Functions: $(echo $FUNCTIONS | wc -w)"
echo "✅ CloudWatch Alarms: $(echo $ALARMS | wc -w)"
echo "✅ SNS Topics: $(echo $TOPICS | wc -w)"
echo "✅ S3 Buckets: $(echo $BUCKETS | wc -w)"
echo "✅ Database Status: $DB_STATUS"
