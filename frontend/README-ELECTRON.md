# 🖥️ Conectados Factura+ - Desktop App (Electron)

Aplicación de escritorio multiplataforma para Conectados Factura+, empaquetando el frontend React en instaladores nativos para Windows, macOS y Linux.

## ✨ Características

- ✅ **Windows**: Instalador NSIS (.exe) + versión portable
- ✅ **macOS**: DMG con soporte Intel y Apple Silicon  
- ✅ **Linux**: AppImage y paquetes DEB
- ✅ **Auto-updates**: Soporte para actualizaciones automáticas
- ✅ **Seguro**: Preload script con context isolation
- ✅ **Nativo**: Integración con sistema operativo (notificaciones, accesos directos)

## 🚀 Quick Start

### 1. Instalación

```bash
cd frontend
npm install
```

### 2. Generar Iconos (Primera vez)

**Windows (PowerShell):**
```powershell
cd scripts
.\generate-icons.ps1
```

**Linux/Mac:**
```bash
cd scripts
chmod +x generate-icons.sh
./generate-icons.sh
```

### 3. Desarrollo

```bash
# Terminal 1: Iniciar servidor Vite
npm run dev

# Terminal 2: Iniciar Electron
npm run electron:dev
```

### 4. Build para Producción

```bash
# Build para todas las plataformas
npm run build:desktop

# Build específico
npm run build:desktop:win    # Windows
npm run build:desktop:mac    # macOS  
npm run build:desktop:linux  # Linux
```

## 📦 Instaladores Generados

### Windows
- `release/Conectados Factura+ Setup 1.0.0.exe` - Instalador con wizard
- `release/Conectados Factura+ 1.0.0.exe` - Versión portable

### macOS
- `release/Conectados Factura+-1.0.0.dmg` - Instalador DMG
- `release/Conectados Factura+-1.0.0-mac.zip` - Versión portable

### Linux
- `release/Conectados Factura+-1.0.0.AppImage` - Portable (recomendado)
- `release/Conectados Factura+-1.0.0.deb` - Para Debian/Ubuntu

## 🛠️ Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run electron:dev` | Desarrollo con hot reload |
| `npm run electron:start` | Build + ejecutar Electron |
| `npm run build:desktop` | Build para todas las plataformas |
| `npm run build:desktop:win` | Build solo Windows |
| `npm run build:desktop:mac` | Build solo macOS |
| `npm run build:desktop:linux` | Build solo Linux |
| `npm run pack` | Empaquetar sin instalar |
| `npm run dist` | Build completo con distribución |

## 📁 Estructura del Proyecto

```
frontend/
├── main.js                  # Entry point Electron
├── preload.js              # Bridge seguro
├── electron-builder.json   # Configuración detallada
├── ELECTRON.md            # Documentación completa
├── assets/                 # Iconos y recursos
│   ├── icon.svg           # Fuente de iconos
│   ├── icon.ico           # Windows
│   ├── icon.icns          # macOS
│   ├── icons/             # Linux (16x16, 32x32...)
│   └── ...
├── scripts/               # Utilidades
│   ├── generate-icons.ps1
│   └── generate-icons.sh
└── release/               # Output (generado)
```

## ⚙️ Configuración

### Variables de Entorno

```bash
# Modo desarrollo
set NODE_ENV=development

# API URL
set VITE_API_URL=https://api.conectadosfactura.com/prod
```

### Personalización

Editar `package.json`:
```json
{
  "version": "1.1.0",
  "build": {
    "productName": "Mi App",
    "appId": "com.miempresa.app"
  }
}
```

## 🔧 Troubleshooting

### Error: "Electron not found"
```bash
npm install
```

### Error: "Cannot find module"
Verificar que `npm run build` generó archivos en `/dist`

### Build muy lento
- Cross-compiling (ej: Windows en Mac) es más lento
- Usar la misma plataforma para builds de producción

### Iconos no aparecen
Generar iconos primero:
```bash
cd scripts && ./generate-icons.sh  # o .ps1 en Windows
```

## 📚 Documentación

- [Guía completa de Electron](ELECTRON.md)
- [Electron oficial](https://www.electronjs.org/)
- [Electron Builder](https://www.electron.build/)

## 📝 Licencia

MIT License - Ver archivo LICENSE para detalles.
