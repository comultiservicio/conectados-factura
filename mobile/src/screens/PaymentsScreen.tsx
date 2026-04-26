import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

interface Payment {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  method: string;
  status: 'pending' | 'completed' | 'failed';
  date: string;
}

const PaymentsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const payments: Payment[] = [
    { id: '1', invoiceNumber: '0001-00000001', customerName: 'Cliente A', amount: 1500, method: 'cash', status: 'completed', date: '2024-01-15' },
    { id: '2', invoiceNumber: '0001-00000002', customerName: 'Cliente B', amount: 2300, method: 'credit_card', status: 'pending', date: '2024-01-16' },
    { id: '3', invoiceNumber: '0001-00000003', customerName: 'Cliente C', amount: 890, method: 'mercado_pago', status: 'completed', date: '2024-01-17' },
  ];

  const filteredPayments = payments.filter(p => {
    if (activeTab === 'pending') return p.status === 'pending';
    if (activeTab === 'completed') return p.status === 'completed';
    return true;
  });

  const getMethodIcon = (method: string) => {
    const icons: Record<string, string> = {
      cash: '💵',
      credit_card: '💳',
      debit_card: '💳',
      mercado_pago: '📱',
    };
    return icons[method] || '💰';
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      credit_card: 'Tarjeta Crédito',
      debit_card: 'Tarjeta Débito',
      mercado_pago: 'Mercado Pago',
    };
    return labels[method] || method;
  };

  const summary = {
    total: payments.reduce((sum, p) => sum + p.amount, 0),
    completed: payments.filter(p => p.status === 'completed').length,
    pending: payments.filter(p => p.status === 'pending').length,
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pagos</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => setShowPaymentForm(true)}>
          <Text style={styles.newButtonText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>${summary.total.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Recaudado</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.completed}</Text>
          <Text style={styles.summaryLabel}>Completados</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, summary.pending > 0 && styles.pendingValue]}>
            {summary.pending}
          </Text>
          <Text style={styles.summaryLabel}>Pendientes</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['all', 'pending', 'completed'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'all' ? 'Todos' : tab === 'pending' ? 'Pendientes' : 'Completados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Payments List */}
      <ScrollView style={styles.content}>
        {filteredPayments.map(payment => (
          <TouchableOpacity key={payment.id} style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.invoiceNumber}>{payment.invoiceNumber}</Text>
              <View style={[
                styles.statusBadge,
                payment.status === 'completed' && styles.statusCompleted,
                payment.status === 'pending' && styles.statusPending,
              ]}>
                <Text style={styles.statusText}>
                  {payment.status === 'completed' ? 'Completado' : 'Pendiente'}
                </Text>
              </View>
            </View>
            <Text style={styles.customerName}>{payment.customerName}</Text>
            <View style={styles.paymentFooter}>
              <View style={styles.methodContainer}>
                <Text style={styles.methodIcon}>{getMethodIcon(payment.method)}</Text>
                <Text style={styles.methodText}>{getMethodLabel(payment.method)}</Text>
              </View>
              <Text style={styles.amount}>${payment.amount.toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a202c',
  },
  newButton: {
    backgroundColor: '#3182ce',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3182ce',
  },
  pendingValue: {
    color: '#dd6b20',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3182ce',
  },
  tabText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3182ce',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  paymentCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3182ce',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  customerName: {
    fontSize: 16,
    color: '#2d3748',
    marginBottom: 12,
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  methodContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  methodText: {
    fontSize: 14,
    color: '#718096',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
  },
});

export default PaymentsScreen;
