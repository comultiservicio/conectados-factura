# Assets para Electron Builder

Esta carpeta contiene los recursos necesarios para construir los instaladores de escritorio.

## Archivos Requeridos

### Iconos

Para generar los iconos de la aplicación en todos los formatos necesarios:

#### Windows (.ico)
- `icon.ico` - Icono principal para Windows (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)

#### macOS (.icns)
- `icon.icns` - Icono para macOS (1024x1024 a 16x16)

#### Linux (.png)
- `icons/` - Carpeta con iconos PNG en múltiples tamaños:
  - `16x16.png`
  - `24x24.png`
  - `32x32.png`
  - `48x48.png`
  - `64x64.png`
  - `128x128.png`
  - `256x256.png`
  - `512x512.png`

### Generar Iconos desde SVG

Si tienes un logo en SVG, puedes usar estas herramientas para generar los iconos:

#### Opción 1: Online (Gratis)
1. [Favicon.io](https://favicon.io/favicon-converter/) - Genera .ico
2. [iConvert Icons](https://iconverticons.com/online/) - Genera .icns
3. [CloudConvert](https://cloudconvert.com/svg-to-png) - Genera PNGs

#### Opción 2: Node.js CLI
```bash
# Instalar herramientas
npm install -g svg2png-cli icon-gen

# Generar PNGs desde SVG
svg2png icon.svg -o icon.png -w 1024

# Generar iconset completo para macOS
icon-gen -i icon.svg -o ./icons -r
```

#### Opción 3: Usar script incluido
```bash
# En Windows con ImageMagick instalado
./scripts/generate-icons.ps1

# En Linux/Mac
./scripts/generate-icons.sh
```

## Archivos de Configuración

### entitlements.plist
Configuración de permisos de seguridad para macOS. Permite:
- Ejecución de código JIT (para V8)
- Acceso a red
- Acceso a archivos seleccionados por el usuario

### installer.nsh
Script personalizado para el instalador NSIS de Windows:
- Verifica versiones anteriores
- Crea accesos directos
- Configuración de instalación

### LICENSE.txt
Licencia MIT del software.

## Placeholders

Si no tienes iconos personalizados listos, el sistema usará iconos por defecto de Electron. Para producción, reemplaza con tus propios iconos.

## Notas

- Los iconos deben tener fondo transparente (preferiblemente)
- Para macOS, seguir las [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos/overview/themes/)
- Para Windows, usar colores que contrasten con temas claro/oscuro
- Para Linux, usar iconos en formato PNG estándar
