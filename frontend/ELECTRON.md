# 🖥️ Desktop App - Electron Setup

Guía para construir y ejecutar la aplicación de escritorio de Conectados Factura+ usando Electron.

## 📁 Estructura de Archivos

```
frontend/
├── main.js                  # Entry point de Electron
├── preload.js              # Bridge seguro entre main y renderer
├── electron-builder.json   # Configuración de electron-builder
├── package.json            # Scripts y metadata
├── assets/                 # Iconos, licencias, etc.
│   ├── icon.ico
│   ├── icon.icns
│   ├── icons/
│   ├── entitlements.plist
│   ├── installer.nsh
│   └── LICENSE.txt
└── release/                # Output de builds (generado)
    ├── Conectados Factura+ Setup 1.0.0.exe
    ├── Conectados Factura+-1.0.0.dmg
    └── Conectados Factura+-1.0.0.AppImage
```

## 🚀 Scripts Disponibles

### Desarrollo
```bash
# Iniciar en modo desarrollo (con hot reload)
npm run electron:dev

# Build web + iniciar Electron
npm run electron:start
```

### Producción
```bash
# Build para todas las plataformas
npm run build:desktop

# Build específico por plataforma
npm run build:desktop:win    # Windows .exe
npm run build:desktop:mac    # macOS .dmg
npm run build:desktop:linux  # Linux .AppImage y .deb

# Solo empaquetar sin instalar
npm run pack

# Build completo con distribución
npm run dist
```

## 📦 Flujo de Build

### Paso 1: Build Web
```bash
npm run build:web
```
Genera la aplicación React optimizada en `/dist`

### Paso 2: Build Desktop
```bash
npm run build:desktop
```
Empaqueta el contenido de `/dist` con Electron en instaladores nativos.

## 🎯 Output Generado

### Windows
- **NSIS Installer**: `release/Conectados Factura+ Setup 1.0.0.exe`
- **Portable**: `release/Conectados Factura+ 1.0.0.exe`
- Arquitecturas: x64, ia32

### macOS
- **DMG**: `release/Conectados Factura+-1.0.0.dmg`
- **ZIP**: `release/Conectados Factura+-1.0.0-mac.zip`
- Arquitecturas: x64 (Intel), arm64 (Apple Silicon)

### Linux
- **AppImage**: `release/Conectados Factura+-1.0.0.AppImage`
- **DEB**: `release/Conectados Factura+-1.0.0.deb`
- Arquitectura: x64

## ⚙️ Configuración

### Variables de Entorno

En modo desarrollo, Electron carga desde `http://localhost:5173`:
```bash
set NODE_ENV=development
npm run electron:dev
```

En producción, carga archivos estáticos desde `/dist`.

### Personalización

#### Cambiar versión
Editar en `package.json`:
```json
{
  "version": "1.1.0"
}
```

#### Cambiar nombre de app
Editar en `package.json`:
```json
{
  "build": {
    "productName": "Mi App Personalizada"
  }
}
```

#### Cambiar iconos
Reemplazar archivos en `assets/`:
- Windows: `icon.ico`
- macOS: `icon.icns`
- Linux: `icons/16x16.png`, `icons/32x32.png`, etc.

## 🔧 Troubleshooting

### Error: "Cannot find module 'electron'"
```bash
npm install
```

### Error: " electron-builder not found"
```bash
npm install --save-dev electron-builder
```

### Build muy lento
El build de Windows en macOS/Linux o viceversa requiere herramientas específicas. Para builds rápidos, usar la misma plataforma destino.

### Iconos no aparecen
Verificar que los archivos existen en `assets/`:
- Windows: `icon.ico` (formato multi-resolución)
- macOS: `icon.icns` (formato Apple icon)
- Linux: PNGs individuales en `icons/`

### App se abre en blanco
Verificar que el build web se completó exitosamente:
```bash
npm run build:web
ls dist/index.html  # Debe existir
```

## 📝 Notas de Plataforma

### Windows
- Requiere Windows 10 o superior
- Instalador NSIS permite seleccionar directorio de instalación
- Crea accesos directos en Desktop y Start Menu

### macOS
- Requiere macOS 10.13 (High Sierra) o superior
- Compatible con Intel y Apple Silicon (M1/M2)
- DMG incluye shortcut a Applications
- Notarización requerida para distribución fuera de App Store

### Linux
- Compatible con Ubuntu 18.04+, Debian 10+, Fedora 30+
- AppImage: Funciona sin instalación (portable)
- DEB: Instalación estándar con dpkg/apt

## 🔐 Seguridad

El preload script (`preload.js`) expone solo APIs seguras al frontend:
- `getAppVersion()` - Versión de la app
- `getPlatform()` - Plataforma actual
- `checkForUpdates()` - Verificar actualizaciones

No se expone Node.js completo al renderer por seguridad.

## 🔄 Auto-updater

Para implementar auto-updates, configurar en `main.js`:
```javascript
const { autoUpdater } = require('electron-updater');

// Verificar actualizaciones al iniciar
autoUpdater.checkForUpdatesAndNotify();
```

Requiere configurar `publish` en `electron-builder.json`.

## 📚 Recursos

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [Electron Builder](https://www.electron.build/)
- [Electron Fiddle](https://www.electronjs.org/fiddle) - Prototipado rápido

## ✅ Checklist de Release

Antes de distribuir la app:

- [ ] Iconos personalizados en `assets/`
- [ ] Número de versión actualizado en `package.json`
- [ ] Build web funciona (`npm run build:web`)
- [ ] Tests pasan (`npm test`)
- [ ] Build desktop exitoso en todas las plataformas objetivo
- [ ] Instaladores probados en VMs/dispositivos reales
- [ ] Licencia incluida (`assets/LICENSE.txt`)
- [ ] Notas de release preparadas
