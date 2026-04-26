import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

interface OcrDocument {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUri?: string;
  extractedText?: string;
  createdAt: string;
}

const OcrScreen: React.FC = () => {
  const [documents, setDocuments] = useState<OcrDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<OcrDocument | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    requestCameraPermission();
    loadDocuments();
  }, []);

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Permiso de Cámara',
            message: 'Necesitamos acceso a la cámara para escanear documentos',
            buttonPositive: 'OK',
          }
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } catch (err) {
        console.warn(err);
      }
    } else {
      setHasPermission(true);
    }
  };

  const loadDocuments = () => {
    // Mock data - replace with API call
    setDocuments([]);
  };

  const handleCamera = async () => {
    if (!hasPermission) {
      Alert.alert('Error', 'Se requiere permiso de cámara');
      return;
    }

    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: true,
      },
      response => {
        if (response.assets && response.assets[0]) {
          handleImageSelected(response.assets[0]);
        }
      }
    );
  };

  const handleGallery = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: true,
      },
      response => {
        if (response.assets && response.assets[0]) {
          handleImageSelected(response.assets[0]);
        }
      }
    );
  };

  const handleImageSelected = (asset: any) => {
    const newDoc: OcrDocument = {
      id: Date.now().toString(),
      type: 'document',
      status: 'pending',
      imageUri: asset.uri,
      createdAt: new Date().toISOString(),
    };

    setDocuments([newDoc, ...documents]);
    Alert.alert('Éxito', 'Imagen subida. Procesando...');
    
    // Mock processing
    setTimeout(() => {
      setDocuments(prev =>
        prev.map(d =>
          d.id === newDoc.id
            ? { ...d, status: 'completed', extractedText: 'Texto extraído de muestra' }
            : d
        )
      );
    }, 3000);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirmar',
      '¿Eliminar este documento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setDocuments(prev => prev.filter(d => d.id !== id));
            if (selectedDoc?.id === id) {
              setSelectedDoc(null);
            }
          },
        },
      ]
    );
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      pending: '⏳',
      processing: '🔄',
      completed: '✅',
      failed: '❌',
    };
    return icons[status] || '⏳';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>OCR - Documentos</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleCamera}>
          <Text style={styles.actionIcon}>📷</Text>
          <Text style={styles.actionText}>Cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleGallery}>
          <Text style={styles.actionIcon}>🖼️</Text>
          <Text style={styles.actionText}>Galería</Text>
        </TouchableOpacity>
      </View>

      {/* Documents List */}
      <ScrollView style={styles.list}>
        {documents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyText}>No hay documentos</Text>
            <Text style={styles.emptySubtext}>Toma una foto o selecciona de la galería</Text>
          </View>
        ) : (
          documents.map(doc => (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => setSelectedDoc(doc)}
            >
              {doc.imageUri && (
                <Image source={{ uri: doc.imageUri }} style={styles.thumbnail} />
              )}
              <View style={styles.docInfo}>
                <Text style={styles.docType}>Documento {doc.type}</Text>
                <Text style={styles.docDate}>
                  {new Date(doc.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.docStatus}>
                <Text style={styles.statusIcon}>{getStatusIcon(doc.status)}</Text>
                <TouchableOpacity onPress={() => handleDelete(doc.id)}>
                  <Text style={styles.deleteIcon}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Document Detail Modal */}
      {selectedDoc && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalle del Documento</Text>
              <TouchableOpacity onPress={() => setSelectedDoc(null)}>
                <Text style={styles.closeButton}>×</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              {selectedDoc.imageUri && (
                <Image source={{ uri: selectedDoc.imageUri }} style={styles.fullImage} />
              )}
              
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Estado</Text>
                <Text style={styles.detailValue}>
                  {getStatusIcon(selectedDoc.status)} {selectedDoc.status}
                </Text>
              </View>
              
              {selectedDoc.extractedText && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Texto Extraído</Text>
                  <Text style={styles.extractedText}>{selectedDoc.extractedText}</Text>
                </View>
              )}
            </ScrollView>
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
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#3182ce',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4a5568',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#718096',
    marginTop: 8,
  },
  docCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  docInfo: {
    flex: 1,
    marginLeft: 12,
  },
  docType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  docDate: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  docStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIcon: {
    fontSize: 20,
  },
  deleteIcon: {
    fontSize: 20,
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
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
  },
  closeButton: {
    fontSize: 28,
    color: '#718096',
    padding: 4,
  },
  fullImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  detailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 12,
    color: '#718096',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#2d3748',
  },
  extractedText: {
    fontSize: 14,
    color: '#4a5568',
    backgroundColor: '#f7fafc',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
  },
});

export default OcrScreen;
