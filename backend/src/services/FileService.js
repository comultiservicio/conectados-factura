/**
 * Servicio de Archivos Local
 * Reemplaza Amazon S3
 * @module services/FileService
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileService {
  constructor() {
    // Directorio base para almacenamiento
    this.baseDir = process.env.STORAGE_PATH || path.join(__dirname, '../../storage');
    
    // Subdirectorios organizados por tipo
    this.dirs = {
      facturas: path.join(this.baseDir, 'facturas'),
      fotos: path.join(this.baseDir, 'fotos'),
      temp: path.join(this.baseDir, 'temp'),
      backups: path.join(this.baseDir, 'backups')
    };

    this.init();
  }

  /**
   * Inicializa directorios de almacenamiento
   */
  async init() {
    try {
      // Crear directorio base
      if (!fsSync.existsSync(this.baseDir)) {
        fsSync.mkdirSync(this.baseDir, { recursive: true });
      }

      // Crear subdirectorios
      for (const dir of Object.values(this.dirs)) {
        if (!fsSync.existsSync(dir)) {
          fsSync.mkdirSync(dir, { recursive: true });
        }
      }

      console.log('✅ Directorios de almacenamiento inicializados');
    } catch (error) {
      console.error('❌ Error inicializando almacenamiento:', error);
      throw error;
    }
  }

  /**
   * Genera un nombre de archivo único
   * @param {string} originalName - Nombre original del archivo
   * @returns {string} Nombre único
   */
  generateFileName(originalName) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName).toLowerCase();
    return `${timestamp}_${random}${extension}`;
  }

  /**
   * Guarda un archivo
   * @param {Buffer|string} fileData - Datos del archivo o ruta temporal
   * @param {Object} options - Opciones de guardado
   * @returns {Promise<Object>} Información del archivo guardado
   */
  async save(fileData, options = {}) {
    const {
      filename,
      contentType,
      type = 'facturas', // facturas, fotos, temp
      metadata = {}
    } = options;

    try {
      const uniqueName = this.generateFileName(filename);
      const targetDir = this.dirs[type];
      const filePath = path.join(targetDir, uniqueName);

      // Guardar archivo
      if (Buffer.isBuffer(fileData)) {
        await fs.writeFile(filePath, fileData);
      } else if (typeof fileData === 'string') {
        // Si es una ruta, copiar
        await fs.copyFile(fileData, filePath);
      }

      // Guardar metadatos en archivo JSON asociado
      const metadataPath = `${filePath}.meta.json`;
      const fileStats = await fs.stat(filePath);
      
      const fileInfo = {
        id: uniqueName,
        originalName: filename,
        storedName: uniqueName,
        path: filePath,
        relativePath: path.relative(this.baseDir, filePath),
        contentType: contentType || this.getContentType(filename),
        size: fileStats.size,
        createdAt: new Date().toISOString(),
        metadata
      };

      await fs.writeFile(metadataPath, JSON.stringify(fileInfo, null, 2));

      return fileInfo;
    } catch (error) {
      console.error('Error guardando archivo:', error);
      throw error;
    }
  }

  /**
   * Lee un archivo
   * @param {string} fileId - ID del archivo (nombre único)
   * @param {string} type - Tipo de directorio
   * @returns {Promise<Buffer>} Contenido del archivo
   */
  async read(fileId, type = 'facturas') {
    try {
      const filePath = path.join(this.dirs[type], fileId);
      
      if (!fsSync.existsSync(filePath)) {
        throw new Error('Archivo no encontrado');
      }

      return await fs.readFile(filePath);
    } catch (error) {
      console.error('Error leyendo archivo:', error);
      throw error;
    }
  }

  /**
   * Obtiene información de un archivo
   * @param {string} fileId - ID del archivo
   * @param {string} type - Tipo de directorio
   * @returns {Promise<Object>} Metadatos del archivo
   */
  async getInfo(fileId, type = 'facturas') {
    try {
      const metadataPath = path.join(this.dirs[type], `${fileId}.meta.json`);
      
      if (!fsSync.existsSync(metadataPath)) {
        // Si no hay metadatos, devolver info básica
        const filePath = path.join(this.dirs[type], fileId);
        const stats = await fs.stat(filePath);
        
        return {
          id: fileId,
          storedName: fileId,
          size: stats.size,
          createdAt: stats.birthtime
        };
      }

      const metaContent = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(metaContent);
    } catch (error) {
      console.error('Error obteniendo info del archivo:', error);
      throw error;
    }
  }

  /**
   * Elimina un archivo
   * @param {string} fileId - ID del archivo
   * @param {string} type - Tipo de directorio
   */
  async delete(fileId, type = 'facturas') {
    try {
      const filePath = path.join(this.dirs[type], fileId);
      const metadataPath = `${filePath}.meta.json`;

      // Eliminar archivo principal
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
      }

      // Eliminar metadatos
      if (fsSync.existsSync(metadataPath)) {
        await fs.unlink(metadataPath);
      }

      return { deleted: true, fileId };
    } catch (error) {
      console.error('Error eliminando archivo:', error);
      throw error;
    }
  }

  /**
   * Lista archivos en un directorio
   * @param {string} type - Tipo de directorio
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Promise<Array>} Lista de archivos
   */
  async list(type = 'facturas', filters = {}) {
    try {
      const dir = this.dirs[type];
      const files = await fs.readdir(dir);
      
      const fileList = [];

      for (const file of files) {
        // Ignorar archivos de metadatos en la lista principal
        if (file.endsWith('.meta.json')) continue;

        try {
          const info = await this.getInfo(file, type);
          
          // Aplicar filtros
          if (filters.contentType && !info.contentType?.includes(filters.contentType)) {
            continue;
          }

          if (filters.dateFrom && new Date(info.createdAt) < new Date(filters.dateFrom)) {
            continue;
          }

          if (filters.dateTo && new Date(info.createdAt) > new Date(filters.dateTo)) {
            continue;
          }

          fileList.push(info);
        } catch (e) {
          // Ignorar archivos sin metadatos
          fileList.push({ id: file, storedName: file });
        }
      }

      // Ordenar por fecha de creación descendente
      return fileList.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error listando archivos:', error);
      throw error;
    }
  }

  /**
   * Copia un archivo a otra ubicación
   * @param {string} fileId - ID del archivo origen
   * @param {string} sourceType - Tipo origen
   * @param {string} targetType - Tipo destino
   */
  async copy(fileId, sourceType, targetType) {
    try {
      const sourcePath = path.join(this.dirs[sourceType], fileId);
      const targetPath = path.join(this.dirs[targetType], fileId);
      const sourceMetaPath = `${sourcePath}.meta.json`;
      const targetMetaPath = `${targetPath}.meta.json`;

      await fs.copyFile(sourcePath, targetPath);

      // Copiar metadatos si existen
      if (fsSync.existsSync(sourceMetaPath)) {
        await fs.copyFile(sourceMetaPath, targetMetaPath);
      }

      return { copied: true, from: sourceType, to: targetType, fileId };
    } catch (error) {
      console.error('Error copiando archivo:', error);
      throw error;
    }
  }

  /**
   * Mueve un archivo a otra ubicación
   */
  async move(fileId, sourceType, targetType) {
    await this.copy(fileId, sourceType, targetType);
    await this.delete(fileId, sourceType);
    return { moved: true, from: sourceType, to: targetType, fileId };
  }

  /**
   * Obtiene el tipo de contenido basado en la extensión
   * @param {string} filename - Nombre del archivo
   * @returns {string} Tipo MIME
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
      '.zip': 'application/zip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Crea un backup de todos los archivos
   * @returns {Promise<Object>} Información del backup
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.dirs.backups, timestamp);
      
      fsSync.mkdirSync(backupDir, { recursive: true });

      // Copiar facturas
      const facturas = await this.list('facturas');
      for (const factura of facturas) {
        await this.copy(factura.id, 'facturas', 'backups');
      }

      // Copiar fotos
      const fotos = await this.list('fotos');
      for (const foto of fotos) {
        await this.copy(foto.id, 'fotos', 'backups');
      }

      // Crear índice del backup
      const index = {
        createdAt: new Date().toISOString(),
        facturasCount: facturas.length,
        fotosCount: fotos.length,
        path: backupDir
      };

      await fs.writeFile(
        path.join(backupDir, 'backup-index.json'),
        JSON.stringify(index, null, 2)
      );

      return index;
    } catch (error) {
      console.error('Error creando backup:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de almacenamiento
   * @returns {Promise<Object>} Estadísticas
   */
  async getStats() {
    try {
      const stats = {
        total: { size: 0, count: 0 },
        facturas: { size: 0, count: 0 },
        fotos: { size: 0, count: 0 },
        temp: { size: 0, count: 0 }
      };

      for (const [type, dir] of Object.entries(this.dirs)) {
        if (type === 'backups') continue;

        try {
          const files = await fs.readdir(dir);
          
          for (const file of files) {
            if (file.endsWith('.meta.json')) continue;

            const filePath = path.join(dir, file);
            const fileStats = await fs.stat(filePath);
            
            stats[type].size += fileStats.size;
            stats[type].count++;
            
            stats.total.size += fileStats.size;
            stats.total.count++;
          }
        } catch (e) {
          // Directorio vacío o no existe
        }
      }

      // Convertir a unidades legibles
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      return {
        ...stats,
        formatted: {
          total: formatBytes(stats.total.size),
          facturas: formatBytes(stats.facturas.size),
          fotos: formatBytes(stats.fotos.size),
          temp: formatBytes(stats.temp.size)
        }
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}

// Singleton
module.exports = new FileService();
