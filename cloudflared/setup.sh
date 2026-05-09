#!/bin/bash
# =============================================================================
# Cloudflare Tunnel Setup Script for Conectados Factura+
# =============================================================================
# 
# Este script guía la configuración del tunnel de Cloudflare para
# acceso remoto seguro a la aplicación de facturación.
#
# ERROR 9 FIX: Documentación completa de setup
#
# =============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Cloudflare Tunnel Setup - Conectados Factura+            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Detectar OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo "📋 PASOS DE INSTALACIÓN:"
echo "═══════════════════════"
echo ""

echo "1️⃣  Instalar cloudflared:"
echo ""
case $OS in
    "windows")
        echo "   winget install Cloudflare.cloudflared"
        echo "   O descargar desde: https://github.com/cloudflare/cloudflared/releases"
        ;;
    "mac")
        echo "   brew install cloudflared"
        ;;
    "linux")
        echo "   # Debian/Ubuntu:"
        echo "   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
        echo "   sudo dpkg -i cloudflared-linux-amd64.deb"
        echo ""
        echo "   # RHEL/CentOS:"
        echo "   sudo wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm"
        echo "   sudo rpm -i cloudflared-linux-x86_64.rpm"
        ;;
    *)
        echo "   Visitar: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
        ;;
esac

echo ""
echo "2️⃣  Autenticar con Cloudflare:"
echo ""
echo "   cloudflared tunnel login"
echo ""
echo "   👆 Esto abrirá el navegador para autorizar."
echo ""

echo "3️⃣  Crear el tunnel:"
echo ""
echo "   cloudflared tunnel create conectados-factura"
echo ""

echo "4️⃣  Copiar el TUNNEL_ID generado:"
echo ""
echo "   El comando anterior mostrará un ID como:"
echo "   'Created tunnel conectados-factura with id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'"
echo ""

echo "5️⃣  Configurar variables de entorno (.env):"
echo ""
echo "   CLOUDFLARE_TUNNEL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
echo ""

echo "6️⃣  Actualizar cloudflared/config.yml:"
echo ""
echo "   Reemplazar <TUNNEL_ID> con tu ID real:"
echo ""
echo "   tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
echo "   credentials-file: ~/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json"
echo ""

echo "7️⃣  Ejecutar el tunnel:"
echo ""
echo "   # Opción A: Ejecutar manualmente"
echo "   cloudflared tunnel run conectados-factura"
echo ""
echo "   # Opción B: Instalar como servicio (recomendado para producción)"
echo "   sudo cloudflared service install"
echo "   sudo systemctl start cloudflared"
echo ""

echo "8️⃣  Configurar DNS en Cloudflare Dashboard:"
echo ""
echo "   Ir a: https://dash.cloudflare.com → Tu dominio → DNS"
echo ""
echo "   Crear registro CNAME:"
echo "   - Type: CNAME"
echo "   - Name: factura (o el subdominio deseado)"
echo "   - Target: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.cfargotunnel.com"
echo "   - Proxy status: Proxied (naranja)"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🔧 COMANDOS ÚTILES:"
echo ""
echo "   # Ver estado del tunnel"
echo "   cloudflared tunnel info conectados-factura"
echo ""
echo "   # Listar tunnels"
echo "   cloudflared tunnel list"
echo ""
echo "   # Eliminar tunnel"
echo "   cloudflared tunnel delete conectados-factura"
echo ""
echo "   # Ver logs"
echo "   sudo tail -f /var/log/cloudflared.log"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📁 ARCHIVOS IMPORTANTES:"
echo ""
echo "   ~/.cloudflared/           - Credenciales y config"
echo "   ./cloudflared/config.yml  - Config del proyecto"
echo "   /var/log/cloudflared.log  - Logs (si es servicio)"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo ""
echo "❓ TROUBLESHOOTING:"
echo ""
echo "   # Error: 'failed to dial edge'
echo "   → Verificar que el puerto 7844 no esté bloqueado por firewall"
echo ""
echo "   # Error: 'cannot authenticate'
echo "   → Ejecutar 'cloudflared tunnel login' nuevamente"
echo ""
echo "   # Tunnel no aparece en dashboard"
echo "   → Verificar que el TUNNEL_ID en config.yml sea correcto"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📖 DOCUMENTACIÓN:"
echo "   https://developers.cloudflare.com/cloudflare-one/connections/connect-apps"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
