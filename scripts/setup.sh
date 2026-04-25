#!/bin/bash

# Conectados Factura+ Setup Script
# This script helps set up the entire infrastructure

set -e

echo "🚀 Setting up Conectados Factura+..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI"
        exit 1
    fi
    
    # Check AWS CDK
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK is not installed. Installing..."
        npm install -g aws-cdk
    fi
    
    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured. Please run 'aws configure'"
        exit 1
    fi
    
    print_status "Prerequisites check completed ✅"
}

# Setup infrastructure
setup_infrastructure() {
    print_status "Setting up AWS infrastructure..."
    
    cd infrastructure
    
    # Install dependencies
    print_status "Installing infrastructure dependencies..."
    npm install
    
    # Bootstrap CDK (if needed)
    print_status "Bootstrapping CDK..."
    cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$(aws configure get region)
    
    # Deploy infrastructure
    print_status "Deploying infrastructure stack..."
    cdk deploy ConectadosFacturaStack --require-approval never
    
    cd ..
    print_status "Infrastructure setup completed ✅"
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    # Get database endpoint from CDK output
    DB_ENDPOINT=$(cd infrastructure && cdk output DatabaseEndpoint 2>/dev/null || echo "")
    
    if [ -z "$DB_ENDPOINT" ]; then
        print_warning "Database endpoint not found. Please ensure infrastructure is deployed first."
        return
    fi
    
    print_status "Database endpoint: $DB_ENDPOINT"
    
    # For now, just show the schema file
    print_status "Database schema is available at: database/schema.sql"
    print_status "Please connect to the database and run the schema manually."
    
    print_status "Database setup instructions completed ✅"
}

# Build Lambda functions
build_lambdas() {
    print_status "Building Lambda functions..."
    
    lambda_dirs=("lambda/auth" "lambda/billing" "lambda/stock" "lambda/payments" "lambda/sync" "lambda/ocr")
    
    for dir in "${lambda_dirs[@]}"; do
        if [ -d "$dir" ]; then
            print_status "Building $dir..."
            cd "$dir"
            
            # Create package.json if it doesn't exist
            if [ ! -f "package.json" ]; then
                cat > package.json << EOF
{
  "name": "$(basename $dir)",
  "version": "1.0.0",
  "description": "Lambda function for $(basename $dir)",
  "main": "handler.js",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/client-secretsmanager": "^3.0.0",
    "@aws-sdk/cognito-identity-provider": "^3.0.0",
    "@aws-sdk/client-textract": "^3.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
EOF
            fi
            
            # Install dependencies
            npm install
            
            # Build TypeScript
            npm run build || print_warning "TypeScript build failed for $dir"
            
            cd ../../
        fi
    done
    
    print_status "Lambda functions build completed ✅"
}

# Setup mobile app
setup_mobile() {
    print_status "Setting up mobile app..."
    
    cd mobile
    
    # Install dependencies
    print_status "Installing mobile app dependencies..."
    npm install
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        print_status "Creating .env file..."
        
        # Get outputs from CDK
        API_ENDPOINT=$(cd ../infrastructure && cdk output APIEndpoint 2>/dev/null || echo "https://api.conectadosfactura.com/prod")
        USER_POOL_ID=$(cd ../infrastructure && cdk output UserPoolId 2>/dev/null || echo "")
        USER_POOL_CLIENT_ID=$(cd ../infrastructure && cdk output UserPoolClientId 2>/dev/null || echo "")
        
        cat > .env << EOF
# AWS Configuration
API_BASE_URL=$API_ENDPOINT
COGNITO_IDENTITY_POOL_ID=
USER_POOL_ID=$USER_POOL_ID
USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
APPSYNC_ENDPOINT=
APPSYNC_API_KEY=

# App Configuration
APP_ENV=development
LOG_LEVEL=debug
EOF
        
        print_warning "Please update the .env file with your specific configuration"
    fi
    
    cd ..
    print_status "Mobile app setup completed ✅"
}

# Create deployment scripts
create_deployment_scripts() {
    print_status "Creating deployment scripts..."
    
    # Create deploy script
    cat > deploy.sh << 'EOF'
#!/bin/bash

# Conectados Factura+ Deployment Script

set -e

echo "🚀 Deploying Conectados Factura+..."

# Deploy infrastructure
echo "Deploying infrastructure..."
cd infrastructure
cdk deploy ConectadosFacturaStack --require-approval never
cd ..

# Build and deploy Lambda functions
echo "Building Lambda functions..."
./scripts/setup.sh

echo "✅ Deployment completed!"
EOF
    
    chmod +x deploy.sh
    
    # Create development script
    cat > dev.sh << 'EOF'
#!/bin/bash

# Conectados Factura+ Development Setup

echo "🔧 Setting up development environment..."

# Start infrastructure in watch mode
echo "Starting infrastructure watch mode..."
cd infrastructure
npm run watch &
INFRA_PID=$!

# Start mobile app
echo "Starting mobile app..."
cd ../mobile
npm start &
MOBILE_PID=$!

# Wait for user to stop
echo "Development environment started. Press Ctrl+C to stop."
trap "kill $INFRA_PID $MOBILE_PID" EXIT

wait
EOF
    
    chmod +x dev.sh
    
    print_status "Deployment scripts created ✅"
}

# Main execution
main() {
    echo "🎯 Conectados Factura+ Setup"
    echo "================================"
    
    check_prerequisites
    setup_infrastructure
    setup_database
    build_lambdas
    setup_mobile
    create_deployment_scripts
    
    echo ""
    print_status "🎉 Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Review and update configuration files"
    echo "2. Set up database schema manually"
    echo "3. Configure AFIP integration"
    echo "4. Set up payment integrations"
    echo "5. Run 'npm run dev' to start development"
    echo ""
    echo "For more information, see README.md"
}

# Run main function
main "$@"
