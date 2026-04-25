import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { Amplify, Auth } from 'aws-amplify';
import { DataStore } from '@aws-amplify/datastore';
import { NetInfo } from '@react-native-community/netinfo';
import { StatusBar } from 'react-native';

// Screens
import LoginScreen from './screens/auth/LoginScreen';
import DashboardScreen from './screens/dashboard/DashboardScreen';
import InvoiceListScreen from './screens/invoices/InvoiceListScreen';
import InvoiceDetailScreen from './screens/invoices/InvoiceDetailScreen';
import CreateInvoiceScreen from './screens/invoices/CreateInvoiceScreen';
import StockScreen from './screens/stock/StockScreen';
import StockMovementScreen from './screens/stock/StockMovementScreen';
import CustomerListScreen from './screens/customers/CustomerListScreen';
import CustomerDetailScreen from './screens/customers/CustomerDetailScreen';
import PaymentScreen from './screens/payments/PaymentScreen';
import OCRScreen from './screens/ocr/OCRScreen';
import SettingsScreen from './screens/settings/SettingsScreen';

// AWS Amplify configuration
const awsConfig = {
  aws_project_region: process.env.AWS_REGION || 'us-east-1',
  aws_cognito_identity_pool_id: process.env.COGNITO_IDENTITY_POOL_ID,
  aws_cognito_region: process.env.AWS_REGION || 'us-east-1',
  aws_user_pools_id: process.env.USER_POOL_ID,
  aws_user_pools_web_client_id: process.env.USER_POOL_CLIENT_ID,
  aws_appsync_graphqlEndpoint: process.env.APPSYNC_ENDPOINT,
  aws_appsync_region: process.env.AWS_REGION || 'us-east-1',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  aws_appsync_apiKey: process.env.APPSYNC_API_KEY,
};

Amplify.configure(awsConfig);

const Stack = createStackNavigator();

interface AppState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnected: boolean;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isAuthenticated: false,
    isLoading: true,
    isConnected: true,
  });

  useEffect(() => {
    initializeApp();
    setupNetworkListener();
  }, []);

  const initializeApp = async () => {
    try {
      // Check if user is already authenticated
      const currentUser = await Auth.currentAuthenticatedUser();
      setState(prev => ({
        ...prev,
        isAuthenticated: !!currentUser,
        isLoading: false,
      }));

      // Initialize DataStore for offline sync
      if (currentUser) {
        await DataStore.start();
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        isLoading: false,
      }));
    }
  };

  const setupNetworkListener = () => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected ?? false;
      setState(prev => ({
        ...prev,
        isConnected,
      }));

      // Handle network reconnection
      if (isConnected) {
        handleNetworkReconnection();
      }
    });

    return unsubscribe;
  };

  const handleNetworkReconnection = async () => {
    try {
      // Sync pending data when network is restored
      await DataStore.start();
      console.log('Network restored, syncing data...');
    } catch (error) {
      console.error('Error syncing data:', error);
    }
  };

  const handleAuthSuccess = () => {
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
    }));
  };

  const handleAuthError = () => {
    setState(prev => ({
      ...prev,
      isAuthenticated: false,
    }));
  };

  if (state.isLoading) {
    return <LoadingScreen />;
  }

  return (
    <PaperProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#2E7D32',
            },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          {state.isAuthenticated ? (
            // Authenticated screens
            <>
              <Stack.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                  title: 'Conectados Factura+',
                  headerLeft: null,
                }}
              />
              <Stack.Screen
                name="InvoiceList"
                component={InvoiceListScreen}
                options={{ title: 'Facturas' }}
              />
              <Stack.Screen
                name="InvoiceDetail"
                component={InvoiceDetailScreen}
                options={{ title: 'Detalle de Factura' }}
              />
              <Stack.Screen
                name="CreateInvoice"
                component={CreateInvoiceScreen}
                options={{ title: 'Nueva Factura' }}
              />
              <Stack.Screen
                name="Stock"
                component={StockScreen}
                options={{ title: 'Stock' }}
              />
              <Stack.Screen
                name="StockMovement"
                component={StockMovementScreen}
                options={{ title: 'Movimientos de Stock' }}
              />
              <Stack.Screen
                name="CustomerList"
                component={CustomerListScreen}
                options={{ title: 'Clientes' }}
              />
              <Stack.Screen
                name="CustomerDetail"
                component={CustomerDetailScreen}
                options={{ title: 'Detalle de Cliente' }}
              />
              <Stack.Screen
                name="Payment"
                component={PaymentScreen}
                options={{ title: 'Pagos' }}
              />
              <Stack.Screen
                name="OCR"
                component={OCRScreen}
                options={{ title: 'Escanear Documento' }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Configuración' }}
              />
            </>
          ) : (
            // Authentication screens
            <Stack.Screen
              name="Login"
              options={{ headerShown: false }}
            >
              {(props) => (
                <LoginScreen
                  {...props}
                  onAuthSuccess={handleAuthSuccess}
                  onAuthError={handleAuthError}
                />
              )}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
};

const LoadingScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2E7D32" />
      <Text style={styles.loadingText}>Cargando Conectados Factura+</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '600',
  },
});

export default App;
