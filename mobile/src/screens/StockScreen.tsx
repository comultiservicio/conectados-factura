import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  minStock: number;
}

const StockScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'products'>('inventory');
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    price: '',
    minStock: '10',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = () => {
    // Mock data - replace with API call
    setProducts([
      { id: '1', name: 'Producto A', sku: 'SKU001', price: 100, quantity: 50, minStock: 10 },
      { id: '2', name: 'Producto B', sku: 'SKU002', price: 200, quantity: 5, minStock: 10 },
      { id: '3', name: 'Producto C', sku: 'SKU003', price: 150, quantity: 0, minStock: 5 },
    ]);
  };

  const handleAddProduct = () => {
    if (!newProduct.name || !newProduct.sku || !newProduct.price) {
      Alert.alert('Error', 'Complete todos los campos');
      return;
    }

    const product: Product = {
      id: Date.now().toString(),
      name: newProduct.name,
      sku: newProduct.sku,
      price: parseFloat(newProduct.price),
      quantity: 0,
      minStock: parseInt(newProduct.minStock) || 10,
    };

    setProducts([...products, product]);
    setNewProduct({ name: '', sku: '', price: '', minStock: '10' });
    setShowAddForm(false);
    Alert.alert('Éxito', 'Producto agregado');
  };

  const getStockStatus = (qty: number, min: number) => {
    if (qty === 0) return { label: 'Sin Stock', color: '#e53e3e' };
    if (qty <= min) return { label: 'Bajo', color: '#dd6b20' };
    return { label: 'OK', color: '#38a169' };
  };

  const lowStockProducts = products.filter(p => p.quantity <= p.minStock);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stock</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddForm(true)}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <View style={styles.alertsContainer}>
          <Text style={styles.alertsTitle}>⚠️ Stock Bajo ({lowStockProducts.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {lowStockProducts.map(product => (
              <View key={product.id} style={styles.alertCard}>
                <Text style={styles.alertName}>{product.name}</Text>
                <Text style={styles.alertQty}>{product.quantity} / {product.minStock}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'inventory' && styles.tabActive]}
          onPress={() => setActiveTab('inventory')}
        >
          <Text style={[styles.tabText, activeTab === 'inventory' && styles.tabTextActive]}>
            Inventario
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'products' && styles.tabActive]}
          onPress={() => setActiveTab('products')}
        >
          <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>
            Productos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'inventory' ? (
          products.map(product => {
            const status = getStockStatus(product.quantity, product.minStock);
            return (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productSku}>{product.sku}</Text>
                </View>
                <View style={styles.productStats}>
                  <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {product.quantity} - {status.label}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          products.map(product => (
            <View key={product.id} style={styles.productCard}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productSku}>{product.sku}</Text>
              <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Product Modal */}
      {showAddForm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nuevo Producto</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del producto"
              value={newProduct.name}
              onChangeText={text => setNewProduct(prev => ({ ...prev, name: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="SKU"
              value={newProduct.sku}
              onChangeText={text => setNewProduct(prev => ({ ...prev, sku: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Precio"
              keyboardType="decimal-pad"
              value={newProduct.price}
              onChangeText={text => setNewProduct(prev => ({ ...prev, price: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Stock mínimo"
              keyboardType="numeric"
              value={newProduct.minStock}
              onChangeText={text => setNewProduct(prev => ({ ...prev, minStock: text }))}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleAddProduct}
              >
                <Text style={styles.saveButtonText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  addButton: {
    backgroundColor: '#3182ce',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  alertsContainer: {
    backgroundColor: '#fff5f5',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#feb2b2',
  },
  alertsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c53030',
    marginBottom: 12,
  },
  alertCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 120,
  },
  alertName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2d3748',
  },
  alertQty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c53030',
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
  productCard: {
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
  productInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  productSku: {
    fontSize: 12,
    color: '#718096',
    backgroundColor: '#f7fafc',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3182ce',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#edf2f7',
  },
  cancelButtonText: {
    color: '#4a5568',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#3182ce',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default StockScreen;
