import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminSetUserPasswordCommand, AdminCreateUserCommand, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';

import { User, ApiResponse } from '../../shared/types';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

class AuthService {
  private async validateUser(token: string): Promise<User> {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      
      // Get user details from Cognito
      const command = new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: payload['cognito:username'],
      });

      const response = await cognitoClient.send(command);
      
      const user: User = {
        id: payload.sub,
        email: response.UserAttributes?.find(attr => attr.Name === 'email')?.Value || '',
        firstName: response.UserAttributes?.find(attr => attr.Name === 'given_name')?.Value || '',
        lastName: response.UserAttributes?.find(attr => attr.Name === 'family_name')?.Value || '',
        role: response.UserAttributes?.find(attr => attr.Name === 'custom:role')?.Value as any || 'driver',
        companyId: response.UserAttributes?.find(attr => attr.Name === 'custom:company_id')?.Value || '',
        isActive: response.UserStatus === 'CONFIRMED',
        cognitoSub: payload.sub,
      };

      return user;
    } catch (error) {
      throw new Error('Invalid authentication token');
    }
  }

  async login(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const { email, password } = JSON.parse(event.body || '{}');

      if (!email || !password) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Email and password are required' 
        });
      }

      const command = new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.USER_POOL_CLIENT_ID || '',
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const response = await cognitoClient.send(command);

      if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return this.createResponse(200, {
          success: true,
          data: {
            challengeName: 'NEW_PASSWORD_REQUIRED',
            session: response.Session,
          },
        });
      }

      if (!response.AuthenticationResult) {
        return this.createResponse(401, {
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Get user details
      const user = await this.validateUser(response.AuthenticationResult.IdToken || '');

      return this.createResponse(200, {
        success: true,
        data: {
          user,
          token: response.AuthenticationResult.IdToken,
          refreshToken: response.AuthenticationResult.RefreshToken,
          expiresIn: response.AuthenticationResult.ExpiresIn,
        },
      });

    } catch (error) {
      console.error('Login error:', error);
      return this.createResponse(401, {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      });
    }
  }

  async completeNewPasswordChallenge(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const { email, newPassword, session } = JSON.parse(event.body || '{}');

      if (!email || !newPassword || !session) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Email, new password, and session are required' 
        });
      }

      // First, set the new password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: newPassword,
        Permanent: true,
      });

      await cognitoClient.send(setPasswordCommand);

      // Now, authenticate with the new password
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.USER_POOL_CLIENT_ID || '',
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: newPassword,
        },
      });

      const authResponse = await cognitoClient.send(authCommand);

      if (!authResponse.AuthenticationResult) {
        return this.createResponse(401, {
          success: false,
          error: 'Password set but authentication failed',
        });
      }

      // Get user details
      const user = await this.validateUser(authResponse.AuthenticationResult.IdToken || '');

      return this.createResponse(200, {
        success: true,
        data: {
          user,
          token: authResponse.AuthenticationResult.IdToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken,
          expiresIn: authResponse.AuthenticationResult.ExpiresIn,
        },
      });

    } catch (error) {
      console.error('Complete password challenge error:', error);
      return this.createResponse(400, {
        success: false,
        error: error instanceof Error ? error.message : 'Password reset failed',
      });
    }
  }

  async refreshToken(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const { refreshToken } = JSON.parse(event.body || '{}');

      if (!refreshToken) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Refresh token is required' 
        });
      }

      const command = new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.USER_POOL_CLIENT_ID || '',
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      });

      const response = await cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        return this.createResponse(401, {
          success: false,
          error: 'Invalid refresh token',
        });
      }

      return this.createResponse(200, {
        success: true,
        data: {
          token: response.AuthenticationResult.IdToken,
          refreshToken: refreshToken, // Keep the same refresh token
          expiresIn: response.AuthenticationResult.ExpiresIn,
        },
      });

    } catch (error) {
      console.error('Refresh token error:', error);
      return this.createResponse(401, {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      });
    }
  }

  async getCurrentUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const user = await this.validateUser(token);

      return this.createResponse(200, {
        success: true,
        data: user,
      });

    } catch (error) {
      console.error('Get current user error:', error);
      return this.createResponse(401, {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid token',
      });
    }
  }

  async createUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const { email, password, firstName, lastName, role, companyId } = JSON.parse(event.body || '{}');

      if (!email || !password || !firstName || !lastName || !role || !companyId) {
        return this.createResponse(400, { 
          success: false, 
          error: 'All fields are required: email, password, firstName, lastName, role, companyId' 
        });
      }

      // Create user in Cognito
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'given_name', Value: firstName },
          { Name: 'family_name', Value: lastName },
          { Name: 'custom:role', Value: role },
          { Name: 'custom:company_id', Value: companyId },
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS', // Don't send welcome email
      });

      const response = await cognitoClient.send(createUserCommand);

      // Set permanent password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
      });

      await cognitoClient.send(setPasswordCommand);

      const user: User = {
        id: response.User?.Attributes?.find(attr => attr.Name === 'sub')?.Value || uuidv4(),
        email,
        firstName,
        lastName,
        role: role as any,
        companyId,
        isActive: true,
      };

      return this.createResponse(201, {
        success: true,
        data: user,
      });

    } catch (error) {
      console.error('Create user error:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'User creation failed',
      });
    }
  }

  async updateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const user = await this.validateUser(token);
      const updateData = JSON.parse(event.body || '{}');

      // Build user attributes to update
      const userAttributes: any[] = [];

      if (updateData.firstName) {
        userAttributes.push({ Name: 'given_name', Value: updateData.firstName });
      }
      if (updateData.lastName) {
        userAttributes.push({ Name: 'family_name', Value: updateData.lastName });
      }
      if (updateData.email) {
        userAttributes.push({ Name: 'email', Value: updateData.email });
      }

      if (userAttributes.length > 0) {
        const updateUserCommand = new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: user.email,
          UserAttributes: userAttributes,
        });

        await cognitoClient.send(updateUserCommand);
      }

      // Return updated user
      const updatedUser = { ...user, ...updateData };

      return this.createResponse(200, {
        success: true,
        data: updatedUser,
      });

    } catch (error) {
      console.error('Update user error:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'User update failed',
      });
    }
  }

  private createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    };
  }
}

const authService = new AuthService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/auth/login')) {
          return await authService.login(event);
        } else if (path.includes('/auth/refresh')) {
          return await authService.refreshToken(event);
        } else if (path.includes('/auth/new-password')) {
          return await authService.completeNewPasswordChallenge(event);
        } else if (path.includes('/auth/register')) {
          return await authService.createUser(event);
        }
        break;
      case 'GET':
        if (path.includes('/auth/me')) {
          return await authService.getCurrentUser(event);
        }
        break;
      case 'PUT':
        if (path.includes('/auth/me')) {
          return await authService.updateUser(event);
        }
        break;
      default:
        return authService.createResponse(405, { 
          success: false, 
          error: 'Method not allowed' 
        });
    }

    return authService.createResponse(404, { 
      success: false, 
      error: 'Endpoint not found' 
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return authService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};
