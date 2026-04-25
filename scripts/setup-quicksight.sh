#!/bin/bash

# Conectados Factura+ QuickSight Setup Script
# This script configures QuickSight dashboards for the application

set -e

echo "📊 Setting up QuickSight Dashboards..."

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
DB_SECRET_ARN=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.DatabaseSecretArn')
API_ENDPOINT=$(cdk list --json | jq -r '.ConectadosFacturaStack.outputs.APIEndpoint')

# Get database credentials
DB_CREDENTIALS=$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --query SecretString --output text)
DB_HOST=$(echo $DB_CREDENTIALS | jq -r '.host')
DB_PORT=$(echo $DB_CREDENTIALS | jq -r '.port')
DB_NAME=$(echo $DB_CREDENTIALS | jq -r '.dbname')
DB_USER=$(echo $DB_CREDENTIALS | jq -r '.password')

# Step 1: Register QuickSight account (if not already registered)
echo "📝 Step 1: Checking QuickSight registration..."
aws quicksight describe-account-settings --aws-account-id 123456789012 --region us-east-1 > /dev/null 2>&1 || {
    echo "🔧 Registering QuickSight account..."
    aws quicksight register-account --aws-account-id 123456789012 --region us-east-1 \
        --edition "STANDARD" \
        --notification-email "admin@conectadosfactura.com" \
        --authentication-method "IAM"
    echo "✅ QuickSight account registered"
}

# Step 2: Create IAM role for QuickSight access
echo "🔐 Step 2: Creating IAM role for QuickSight..."

ROLE_NAME="ConectadosQuickSightRole"
ROLE_POLICY_DOCUMENT=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "quicksight.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF
)

# Create role if it doesn't exist
aws iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1 || {
    aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$ROLE_POLICY_DOCUMENT"
    
    # Attach policies for database access
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/AWSQuicksightAccess"
    
    # Create and attach custom policy for database access
    cat > quicksight-db-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rds-db:connect"
            ],
            "Resource": [
                "arn:aws:rds-db:us-east-1:123456789012:dbuser:conectados-factura-db/$DB_USER"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "rds:DescribeDBInstances",
                "rds:DescribeDBClusters"
            ],
            "Resource": "*"
        }
    ]
}
EOF
    
    aws iam create-policy --policy-name "ConectadosQuickSightDBPolicy" --policy-document file://quicksight-db-policy.json
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::123456789012:policy/ConectadosQuickSightDBPolicy"
    
    echo "✅ IAM role created and policies attached"
}

# Step 3: Create data sources
echo "📊 Step 3: Creating QuickSight data sources..."

# PostgreSQL data source
POSTGRES_DS_NAME="ConectadosPostgreSQL"
aws quicksight create-data-source --aws-account-id 123456789012 --region us-east-1 \
    --data-source-id "$POSTGRES_DS_NAME" \
    --name "$POSTGRES_DS_NAME" \
    --type "POSTGRES" \
    --data-source-parameters "PostgresParameters={Host=$DB_HOST,Port=$DB_PORT,Database=$DB_NAME}" \
    --credentials "SecretArn=$DB_SECRET_ARN" \
    --ssl-properties "SslProperties={DisableSsl=false}" || echo "⚠️ PostgreSQL data source may already exist"

# DynamoDB data source
DYNAMODB_DS_NAME="ConectadosDynamoDB"
aws quicksight create-data-source --aws-account-id 123456789012 --region us-east-1 \
    --data-source-id "$DYNAMODB_DS_NAME" \
    --name "$DYNAMODB_DS_NAME" \
    --type "DYNAMODB" || echo "⚠️ DynamoDB data source may already exist"

# Step 4: Create datasets
echo "📈 Step 4: Creating QuickSight datasets..."

# Sales dataset
SALES_DATASET_ID="ConectadosSales"
aws quicksight create-data-set --aws-account-id 123456789012 --region us-east-1 \
    --data-set-id "$SALES_DATASET_ID" \
    --name "Conectados Sales" \
    --data-source-id "$POSTGRES_DS_NAME" \
    --import-mode "SPICE" \
    --physical-table-map "SalesTable={RelationalTable={InputColumns=[{Name='id',Type='STRING'},{Name='customer_id',Type='STRING'},{Name='total_amount',Type='DECIMAL'},{Name='issue_date',Type='DATETIME'},{Name='status',Type='STRING'}]}}" || echo "⚠️ Sales dataset may already exist"

# Stock dataset
STOCK_DATASET_ID="ConectadosStock"
aws quicksight create-data-set --aws-account-id 123456789012 --region us-east-1 \
    --data-set-id "$STOCK_DATASET_ID" \
    --name "Conectados Stock" \
    --data-source-id "$POSTGRES_DS_NAME" \
    --import-mode "SPICE" \
    --physical-table-map "StockTable={RelationalTable={InputColumns=[{Name='product_id',Type='STRING'},{Name='warehouse_id',Type='STRING'},{Name='quantity',Type='INTEGER'},{Name='movement_type',Type='STRING'},{Name='created_at',Type='DATETIME'}]}}" || echo "⚠️ Stock dataset may already exist"

# Payments dataset
PAYMENTS_DATASET_ID="ConectadosPayments"
aws quicksight create-data-set --aws-account-id 123456789012 --region us-east-1 \
    --data-set-id "$PAYMENTS_DATASET_ID" \
    --name "Conectados Payments" \
    --data-source-id "$POSTGRES_DS_NAME" \
    --import-mode "SPICE" \
    --physical-table-map "PaymentsTable={RelationalTable={InputColumns=[{Name='id',Type='STRING'},{Name='invoice_id',Type='STRING'},{Name='amount',Type='DECIMAL'},{Name='payment_method',Type='STRING'},{Name='status',Type='STRING'},{Name='payment_date',Type='DATETIME'}]}}" || echo "⚠️ Payments dataset may already exist"

# Step 5: Create dashboards
echo "📊 Step 5: Creating QuickSight dashboards..."

# Sales dashboard
SALES_DASHBOARD_ID="ConectadosSalesDashboard"
cat > sales-dashboard.json <<EOF
{
    "DashboardId": "$SALES_DASHBOARD_ID",
    "Name": "Conectados Sales Dashboard",
    "Definition": {
        "DataSetIdentifierDeclarations": [
            {
                "DataSetArn": "arn:aws:quicksight:us-east-1:123456789012:dataset/$SALES_DATASET_ID",
                "Identifier": "$SALES_DATASET_ID"
            }
        ],
        "Sheets": [
            {
                "SheetId": "SalesOverview",
                "Name": "Sales Overview",
                "Visuals": [
                    {
                        "Id": "DailySales",
                        "Type": "LINE_CHART",
                        "SourceVisualId": null,
                        "DataSetVisualId": {
                            "DataSetIdentifier": "$SALES_DATASET_ID",
                            "VisualColumnReferences": [
                                {
                                    "Column": {
                                        "ColumnName": "issue_date",
                                        "DataSetIdentifier": "$SALES_DATASET_ID"
                                    },
                                    "FieldId": "issue_date"
                                },
                                {
                                    "Column": {
                                        "ColumnName": "total_amount",
                                        "DataSetIdentifier": "$SALES_DATASET_ID"
                                    },
                                    "FieldId": "total_amount"
                                }
                            ]
                        }
                    },
                    {
                        "Id": "SalesByStatus",
                        "Type": "PIE_CHART",
                        "SourceVisualId": null,
                        "DataSetVisualId": {
                            "DataSetIdentifier": "$SALES_DATASET_ID",
                            "VisualColumnReferences": [
                                {
                                    "Column": {
                                        "ColumnName": "status",
                                        "DataSetIdentifier": "$SALES_DATASET_ID"
                                    },
                                    "FieldId": "status"
                                },
                                {
                                    "Column": {
                                        "ColumnName": "total_amount",
                                        "DataSetIdentifier": "$SALES_DATASET_ID"
                                    },
                                    "FieldId": "total_amount"
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    },
    "VersionDescription": "Initial version"
}
EOF

aws quicksight create-dashboard --aws-account-id 123456789012 --region us-east-1 \
    --dashboard-id "$SALES_DASHBOARD_ID" \
    --name "Conectados Sales Dashboard" \
    --definition file://sales-dashboard.json || echo "⚠️ Sales dashboard may already exist"

# Stock dashboard
STOCK_DASHBOARD_ID="ConectadosStockDashboard"
cat > stock-dashboard.json <<EOF
{
    "DashboardId": "$STOCK_DASHBOARD_ID",
    "Name": "Conectados Stock Dashboard",
    "Definition": {
        "DataSetIdentifierDeclarations": [
            {
                "DataSetArn": "arn:aws:quicksight:us-east-1:123456789012:dataset/$STOCK_DATASET_ID",
                "Identifier": "$STOCK_DATASET_ID"
            }
        ],
        "Sheets": [
            {
                "SheetId": "StockOverview",
                "Name": "Stock Overview",
                "Visuals": [
                    {
                        "Id": "StockLevels",
                        "Type": "BAR_CHART",
                        "SourceVisualId": null,
                        "DataSetVisualId": {
                            "DataSetIdentifier": "$STOCK_DATASET_ID",
                            "VisualColumnReferences": [
                                {
                                    "Column": {
                                        "ColumnName": "product_id",
                                        "DataSetIdentifier": "$STOCK_DATASET_ID"
                                    },
                                    "FieldId": "product_id"
                                },
                                {
                                    "Column": {
                                        "ColumnName": "quantity",
                                        "DataSetIdentifier": "$STOCK_DATASET_ID"
                                    },
                                    "FieldId": "quantity"
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    },
    "VersionDescription": "Initial version"
}
EOF

aws quicksight create-dashboard --aws-account-id 123456789012 --region us-east-1 \
    --dashboard-id "$STOCK_DASHBOARD_ID" \
    --name "Conectados Stock Dashboard" \
    --definition file://stock-dashboard.json || echo "⚠️ Stock dashboard may already exist"

# Step 6: Grant permissions to users
echo "👥 Step 6: Granting dashboard permissions..."

# Grant permissions to admin user
aws quicksight update-dashboard-permissions --aws-account-id 123456789012 --region us-east-1 \
    --dashboard-id "$SALES_DASHBOARD_ID" \
    --grant-permissions "arn:aws:quicksight:us-east-1:123456789012:user/default/admin"=READ || echo "⚠️ Permissions may already be granted"

aws quicksight update-dashboard-permissions --aws-account-id 123456789012 --region us-east-1 \
    --dashboard-id "$STOCK_DASHBOARD_ID" \
    --grant-permissions "arn:aws:quicksight:us-east-1:123456789012:user/default/admin"=READ || echo "⚠️ Permissions may already be granted"

# Step 7: Clean up temporary files
rm -f quicksight-db-policy.json sales-dashboard.json stock-dashboard.json

echo ""
echo "🎉 QuickSight setup completed!"
echo ""
echo "📊 Dashboards Created:"
echo "📈 Sales Dashboard: https://us-east-1.quicksight.aws.amazon.com/sn/dashboards/$SALES_DASHBOARD_ID"
echo "📦 Stock Dashboard: https://us-east-1.quicksight.aws.amazon.com/sn/dashboards/$STOCK_DASHBOARD_ID"
echo ""
echo "📖 Next Steps:"
echo "1. Log in to QuickSight console"
echo "2. Verify dashboards are accessible"
echo "3. Customize visualizations as needed"
echo "4. Share dashboards with team members"
