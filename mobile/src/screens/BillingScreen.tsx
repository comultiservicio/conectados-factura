import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { z } from 'zod';

const invoiceItemSchema = z.object({
  productId: z.string(),
  productName: z.string().min(1, 'Nombre requerido'),
  quantity: z.number().positive('Cantidad debe ser positiva'),
  unitPrice: z.number().positive('Precio debe ser positivo'),
});

const invoiceSchema = z.object({
  customerName: z.string().min(2, 'Nombre del cliente requerido'),
  customerCuit: z.string().regex(/^\d{2}-\d{8}-\d$/, 'CUIT inválido'),
  invoiceType: z.enum(['A', 'B', 'C']),
  paymentMethod: z.enum(['cash', 'credit_card', 'debit_card', 'mercado_pago']),
  items: z.array(invoiceItemSchema).min(1, 'Debe incluir al menos un ítem'),
});

const BillingScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerCuit: '',
    invoiceType: 'B',
    paymentMethod: 'cash',
    items: [] as any[],
  });
  const [currentItem, setCurrentItem] = useState({
    productName: '',
    quantity: '1',
    unitPrice: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    // Mock data - replace with API call
    setInvoices([
      { id: '1', invoiceNumber: '0001-00000001', customerName: 'Cliente A', total: 1500, status: 'issued' },
      { id: '2', invoiceNumber: '0001-00000002', customerName: 'Cliente B', total: 2300, status: 'draft' },
    ]);
  };

  const addItem = () => {
    const qty = parseInt(currentItem.quantity) || 1;
    const price = parseFloat(currentItem.unitPrice) || 0;
    
    if (!currentItem.productName || price <= 0) {
      Alert.alert('Error', 'Ingrese nombre del producto y precio válido');
      return;
    }

    const newItem = {
      productId: Date.now().toString(),
      productName: currentItem.productName,
      quantity: qty,
      unitPrice: price,
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    setCurrentItem({ productName: '', quantity: '1', unitPrice: '' });
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * 0.21;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setErrors({});

    try {
      invoiceSchema.parse(formData);
      Alert.alert('Éxito', 'Factura creada correctamente');
      setShowForm(false);
      setFormData({
        customerName: '',
        customerCuit: '',
        invoiceType: 'B',
        paymentMethod: 'cash',
        items: [],
      });
      loadInvoices();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err: z.ZodIssue) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        Alert.alert('Error', 'Verifique los campos marcados');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      issued: 'Emitida',
      cancelled: 'Anulada',
    };
    return labels[status] || status;
  };

  if (showForm) {
    const totals = calculateTotals();
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowForm(false)}>
            <Text style={styles.backButton}>‹ Volver</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Nueva Factura</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Datos del Cliente</Text>
          <TextInput
            style={[styles.input, errors.customerName && styles.inputError]}
            placeholder="Nombre del cliente"
            value={formData.customerName}
            onChangeText={text => setFormData(prev => ({ ...prev, customerName: text }))}
          />
          {errors.customerName && <Text style={styles.errorText}>{errors.customerName}</Text>}

          <TextInput
            style={[styles.input, errors.customerCuit && styles.inputError]}
            placeholder="CUIT (##-########-#)"
            value={formData.customerCuit}
            onChangeText={text => setFormData(prev => ({ ...prev, customerCuit: text }))}
          />
          {errors.customerCuit && <Text style={styles.errorText}>{errors.customerCuit}</Text>}

          <Text style={styles.sectionTitle}>Datos de la Factura</Text>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>Tipo:</Text>
            <TouchableOpacity
              style={[styles.pickerButton, formData.invoiceType === 'A' && styles.pickerButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, invoiceType: 'A' }))}
            >
              <Text style={formData.invoiceType === 'A' ? styles.pickerTextActive : styles.pickerText}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerButton, formData.invoiceType === 'B' && styles.pickerButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, invoiceType: 'B' }))}
            >
              <Text style={formData.invoiceType === 'B' ? styles.pickerTextActive : styles.pickerText}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerButton, formData.invoiceType === 'C' && styles.pickerButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, invoiceType: 'C' }))}
            >
              <Text style={formData.invoiceType === 'C' ? styles.pickerTextActive : styles.pickerText}>C</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Ítems</Text>
          <View style={styles.itemForm}>
            <TextInput
              style={styles.input}
              placeholder="Nombre del producto"
              value={currentItem.productName}
              onChangeText={text => setCurrentItem(prev => ({ ...prev, productName: text }))}
            />
            <View style={styles.itemRow}>
              <TextInput
                style={[styles.input, styles.smallInput]}
                placeholder="Cantidad"
                keyboardType="numeric"
                value={currentItem.quantity}
                onChangeText={text => setCurrentItem(prev => ({ ...prev, quantity: text }))}
              />
              <TextInput
                style={[styles.input, styles.flexInput]}
                placeholder="Precio unitario"
                keyboardType="decimal-pad"
                value={currentItem.unitPrice}
                onChangeText={text => setCurrentItem(prev => ({ ...prev, unitPrice: text }))}
              />
              <TouchableOpacity style={styles.addButton} onPress={addItem}>
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {formData.items.map((item, index) => (
            <View key={index} style={styles.itemCard}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemDetail}>
                  {item.quantity} x ${item.unitPrice.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.itemTotal}>${(item.quantity * item.unitPrice).toFixed(2)}</Text>
              <TouchableOpacity onPress={() => removeItem(index)}>
                <Text style={styles.removeButton}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>${totals.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA (21%):</Text>
              <Text style={styles.totalValue}>${totals.taxAmount.toFixed(2)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandTotalLabel}>Total:</Text>
              <Text style={styles.grandTotalValue}>${totals.total.toFixed(2)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Crear Factura</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Facturación</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => setShowForm(true)}>
          <Text style={styles.newButtonText}>+ Nueva</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {invoices.map(invoice => (
          <TouchableOpacity key={invoice.id} style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
              <View style={[styles.statusBadge, invoice.status === 'issued' && styles.statusIssued]}>
                <Text style={styles.statusText}>{getStatusLabel(invoice.status)}</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{invoice.customerName}</Text>
            <Text style={styles.invoiceTotal}>${invoice.total.toFixed(2)}</Text>
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
  backButton: {
    fontSize: 16,
    color: '#3182ce',
  },
  title: {
    fontSize: 18,
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
  form: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a5568',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#e53e3e',
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 12,
    marginBottom: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerLabel: {
    fontSize: 16,
    color: '#4a5568',
  },
  pickerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#edf2f7',
  },
  pickerButtonActive: {
    backgroundColor: '#3182ce',
  },
  pickerText: {
    color: '#4a5568',
    fontWeight: '600',
  },
  pickerTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  itemForm: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  smallInput: {
    width: 80,
  },
  flexInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: '#38a169',
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
    color: '#2d3748',
  },
  itemDetail: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  itemTotal: {
    fontWeight: '600',
    color: '#3182ce',
    marginHorizontal: 12,
  },
  removeButton: {
    fontSize: 20,
    color: '#e53e3e',
    padding: 4,
  },
  totals: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    color: '#4a5568',
  },
  totalValue: {
    fontWeight: '600',
    color: '#2d3748',
  },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a202c',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3182ce',
  },
  submitButton: {
    backgroundColor: '#3182ce',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#a0aec0',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  invoiceCard: {
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
  invoiceHeader: {
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
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusIssued: {
    backgroundColor: '#d1fae5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  customerName: {
    fontSize: 16,
    color: '#2d3748',
    marginBottom: 8,
  },
  invoiceTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
  },
});

export default BillingScreen;
