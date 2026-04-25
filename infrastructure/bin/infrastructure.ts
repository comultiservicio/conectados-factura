#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ConectadosFacturaStack } from '../lib/aws-cdk-stack';

const app = new cdk.App();
new ConectadosFacturaStack(app, 'ConectadosFacturaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
