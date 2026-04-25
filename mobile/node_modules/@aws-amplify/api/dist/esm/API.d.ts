import { V6Client } from '@aws-amplify/api-graphql';
/**
 * Generates an API client that can work with models or raw GraphQL
 */
export declare function generateClient<T extends Record<any, any> = never>(): V6Client<T>;
