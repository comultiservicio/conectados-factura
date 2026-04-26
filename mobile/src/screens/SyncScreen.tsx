import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SyncStatus {
  isOnline: boolean;
  lastSyncAt: string | null;
  pendingItems: number;
  failedItems: number;
}

const SyncScreen: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    lastSyncAt: null,
    pendingItems: 0,
    failedItems: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    try {
      const lastSync = await AsyncStorage.getItem('lastSyncAt');
      const pending = await AsyncStorage.getItem('pendingQueue');
      const pendingItems = pending ? JSON.parse(pending).length : 0;

      setStatus({
        isOnline: true, // Check connectivity
        lastSyncAt: lastSync,
        pendingItems,
        failedItems: 0,
      });
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Mock sync - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await AsyncStorage.setItem('lastSyncAt', new Date().toISOString());
      await AsyncStorage.removeItem('pendingQueue');
      
      setStatus(prev => ({
        ...prev,
        lastSyncAt: new Date().toISOString(),
        pendingItems: 0,
      }));
      
      Alert.alert('Éxito', 'Sincronización completada');
    } catch (error) {
      Alert.alert('Error', 'Falló la sincronización');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (date: string | null) => {
    if (!date) return 'Nunca';
    const d = new Date(date);
    return d.toLocaleString();
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status Card */}
      <View style={[styles.statusCard, status.isOnline ? styles.online : styles.offline]}>
        <Text style={styles.statusIcon}>{status.isOnline ? '🟢' : '🔴'}</Text>
        <Text style={styles.statusText}>
          {status.isOnline ? 'En Línea' : 'Sin Conexión'}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{status.pendingItems}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, status.failedItems > 0 && styles.statValueAlert]}>
            {status.failedItems}
          </Text>
          <Text style={styles.statLabel}>Fallidos</Text>
        </View>
      </View>

      {/* Last Sync */}
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Última Sincronización</Text>
        <Text style={styles.infoValue}>{formatLastSync(status.lastSyncAt)}</Text>
      </View>

      {/* Sync Button */}
      <TouchableOpacity
        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={isSyncing}
      >
        <Text style={styles.syncButtonText}>
          {isSyncing ? '⏳ Sincronizando...' : '📤 Sincronizar Ahora'}
        </Text>
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoSectionTitle}>📴 Modo Offline</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoItemTitle}>Trabajo sin conexión</Text>
            <Text style={styles.infoItemDesc}>Los datos se guardan localmente</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoItemTitle}>Auto-sync</Text>
            <Text style={styles.infoItemDesc}>Sincronización automática cuando hay conexión</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    padding: 16,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  online: {
    backgroundColor: '#d1fae5',
  },
  offline: {
    backgroundColor: '#fee2e2',
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#3182ce',
  },
  statValueAlert: {
    color: '#c53030',
  },
  statLabel: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  syncButton: {
    backgroundColor: '#3182ce',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  syncButtonDisabled: {
    backgroundColor: '#a0aec0',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 20,
  },
  infoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  infoItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0c4a6e',
    marginBottom: 4,
  },
  infoItemDesc: {
    fontSize: 12,
    color: '#4a5568',
  },
});

export default SyncScreen;
