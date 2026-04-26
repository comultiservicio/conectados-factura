# 🖥️ Guía de Build Desktop - Solución Temporal

## Estado Actual

✅ **Build Web**: Funcionando correctamente (`npm run build:web`)
⚠️ **Build Desktop**: Requiere pasos adicionales por configuración de iconos

## Solución Rápida - Desarrollo

### Opción 1: Ejecutar en modo desarrollo (Electron + Vite)

```bash
# Terminal 1: Iniciar Vite dev server
npm run dev

# Terminal 2: En otra terminal, iniciar Electron
set NODE_ENV=development
npx electron .
```

### Opción 2: Build Portable Manual

```bash
# 1. Build web
npm run build:web

# 2. Crear estructura portable manualmente
mkdir release\ConectadosFactura+-portable
copy main.js release\ConectadosFactura+-portable\
copy preload.js release\ConectadosFactura+-portable\
copy -r dist release\ConectadosFactura+-portable\
copy package.json release\ConectadosFactura+-portable\

# 3. Instalar solo dependencias de producción
 cd release\ConectadosFactura+-portable
npm install --production

# 4. Descargar Electron manualmente y extraer
# Descargar desde: https://github.com/electron/electron/releases
# Extraer electron.exe y resources en la carpeta
```

## Solución Completa - Instaladores

### Requisitos Previos

1. **ImageMagick** (para generar iconos)
   - Windows: Descargar de https://imagemagick.org/script/download.php#windows
   - Mac: `brew install imagemagick`
   - Linux: `sudo apt-get install imagemagick`

2. **Iconos de Aplicación**
   - Crear icono fuente en formato SVG o PNG (1024x1024)
   - Guardar como `assets/icon.svg`

### Pasos para Instaladores Finales

#### 1. Generar Iconos

**Windows:**
```powershell
cd scripts
.\generate-icons.ps1
```

**Mac/Linux:**
```bash
cd scripts
chmod +x generate-icons.sh
./generate-icons.sh
```

Esto genera:
- `assets/icon.ico` (Windows)
- `assets/icon.icns` (macOS)  
- `assets/icons/*.png` (Linux)

#### 2. Restaurar Configuración de Iconos

Editar `package.json` y agregar las líneas de iconos que quitamos:

```json
"win": {
  "icon": "assets/icon.ico",
  ...
},
"mac": {
  "icon": "assets/icon.icns",
  ...
},
"linux": {
  "icon": "assets/icons",
  ...
}
```

#### 3. Ejecutar Build

```bash
# Windows
npm run build:desktop:win

# macOS
npm run build:desktop:mac

# Linux
npm run build:desktop:linux
```

## Solución Alternativa - Electron Forge

Si electron-builder continúa fallando, usar Electron Forge:

```bash
# Instalar Electron Forge
npm install --save-dev @electron-forge/cli
npx electron-forge import

# Crear make (instaladores)
npm run make
```

## Estructura del Build Web (Funcional)

El build web ya está generado en `/dist`:

```
dist/
├── index.html          # Entry point
├── assets/
│   ├── index-*.js      # Bundle JavaScript
│   └── index-*.css     # Estilos
└── ...                 # Assets estáticos
```

Este puede desplegarse:
- En servidor web (Nginx, Apache, S3)
- Como app de escritorio con Electron
- Como PWA (Progressive Web App)

## Scripts Disponibles

| Comando | Estado | Descripción |
|---------|--------|-------------|
| `npm run dev` | ✅ | Servidor de desarrollo Vite |
| `npm run build:web` | ✅ | Build producción web |
| `npm run electron:dev` | ✅ | Electron en modo dev |
| `npm run build:desktop` | ⚠️ | Requiere iconos |

## Próximos Pasos Recomendados

1. **Inmediato**: Usar `npm run electron:dev` para desarrollo
2. **Corto plazo**: Generar iconos y ejecutar `npm run build:desktop`
3. **Despliegue**: Usar el contenido de `/dist` para hosting web

## Recursos

- [Electron Builder Docs](https://www.electron.build/)
- [Electron Forge](https://www.electronforge.io/)
- [Icon Generation](assets/README.md)

## Notas

- El build web en `/dist` está listo para producción
- La app funciona correctamente en modo desarrollo con Electron
- Los instaladores requieren configuración adicional de iconos
- Considerar usar [electron-vite](https://electron-vite.org/) para setup más moderno
