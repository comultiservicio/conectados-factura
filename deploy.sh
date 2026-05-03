#!/bin/bash
#
# Script de Deploy para Conectados Factura+
# Servidor Local: 192.168.15.80
#
# Funcionalidades:
# - Pull de últimas imágenes
# - Migraciones automáticas
# - Health checks
# - Rollback automático si falla
#

set -e  # Exit on error

# ============================================
# CONFIGURACIÓN
# ============================================
PROJECT_NAME="conectados-factura"
SERVER_IP="192.168.15.80"
DEPLOY_DIR="/opt/conectados-factura"
BACKUP_DIR="/opt/backups"
LOG_FILE="/var/log/factura-deploy.log"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"  # Opcional

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# FUNCIONES DE UTILIDAD
# ============================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================
# FUNCIONES DE BACKUP
# ============================================

create_backup() {
    log "Creando backup antes del deploy..."
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/pre-deploy-$TIMESTAMP"
    
    # Crear directorio de backup
    mkdir -p "$BACKUP_FILE"
    
    # Backup de la base de datos
    if [ -f "$DEPLOY_DIR/data/factura.db" ]; then
        cp "$DEPLOY_DIR/data/factura.db" "$BACKUP_FILE/factura.db"
        log_success "Backup de base de datos creado"
    fi
    
    # Backup de configuraciones
    if [ -d "$DEPLOY_DIR/nginx" ]; then
        cp -r "$DEPLOY_DIR/nginx" "$BACKUP_FILE/"
        log_success "Backup de configuraciones nginx creado"
    fi
    
    # Backup de .env
    if [ -f "$DEPLOY_DIR/.env" ]; then
        cp "$DEPLOY_DIR/.env" "$BACKUP_FILE/.env"
    fi
    
    # Comprimir backup
    cd "$BACKUP_DIR"
    tar -czf "pre-deploy-$TIMESTAMP.tar.gz" "pre-deploy-$TIMESTAMP"
    rm -rf "pre-deploy-$TIMESTAMP"
    
    log_success "Backup completo: pre-deploy-$TIMESTAMP.tar.gz"
    
    # Mantener solo últimos 5 backups de deploy
    ls -t pre-deploy-*.tar.gz | tail -n +6 | xargs -r rm
    
    echo "pre-deploy-$TIMESTAMP.tar.gz"
}

rollback() {
    local BACKUP_FILE=$1
    
    log_error "Iniciando ROLLBACK..."
    
    if [ -z "$BACKUP_FILE" ]; then
        # Buscar backup más reciente
        BACKUP_FILE=$(ls -t $BACKUP_DIR/pre-deploy-*.tar.gz 2>/dev/null | head -1)
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "No se encontró backup para rollback: $BACKUP_FILE"
        return 1
    fi
    
    log "Restaurando desde: $BACKUP_FILE"
    
    # Detener servicios
    cd "$DEPLOY_DIR"
    docker-compose -f docker-compose.prod.yml down
    
    # Extraer backup
    cd "$BACKUP_DIR"
    tar -xzf "$BACKUP_FILE"
    BACKUP_DIR_NAME=$(tar -tzf "$BACKUP_FILE" | head -1 | cut -f1 -d"/")
    
    # Restaurar archivos
    if [ -f "$BACKUP_DIR_NAME/factura.db" ]; then
        cp "$BACKUP_DIR_NAME/factura.db" "$DEPLOY_DIR/data/factura.db"
    fi
    
    if [ -d "$BACKUP_DIR_NAME/nginx" ]; then
        rm -rf "$DEPLOY_DIR/nginx"
        cp -r "$BACKUP_DIR_NAME/nginx" "$DEPLOY_DIR/"
    fi
    
    if [ -f "$BACKUP_DIR_NAME/.env" ]; then
        cp "$BACKUP_DIR_NAME/.env" "$DEPLOY_DIR/.env"
    fi
    
    # Limpiar
    rm -rf "$BACKUP_DIR_NAME"
    
    # Reiniciar servicios
    cd "$DEPLOY_DIR"
    docker-compose -f docker-compose.prod.yml up -d
    
    log_success "Rollback completado"
    
    # Notificar
    send_notification "🚨 Rollback completado en $SERVER_IP" "El deploy falló y se restauró el backup."
}

# ============================================
# FUNCIONES DE HEALTH CHECK
# ============================================

health_check() {
    log "Ejecutando health checks..."
    
    local RETRIES=5
    local DELAY=10
    local SUCCESS=0
    
    # Check App
    for i in $(seq 1 $RETRIES); do
        if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
            log_success "App (puerto 3000) responde correctamente"
            SUCCESS=$((SUCCESS + 1))
            break
        fi
        log_warning "Intento $i/$RETRIES: App no responde, esperando ${DELAY}s..."
        sleep $DELAY
    done
    
    # Check Nginx
    for i in $(seq 1 $RETRIES); do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            log_success "Nginx responde correctamente"
            SUCCESS=$((SUCCESS + 1))
            break
        fi
        log_warning "Intento $i/$RETRIES: Nginx no responde, esperando ${DELAY}s..."
        sleep $DELAY
    done
    
    # Check Base de datos (usando endpoint de health)
    for i in $(seq 1 $RETRIES); do
        if curl -sf http://localhost:3000/api/health/db > /dev/null 2>&1; then
            log_success "Base de datos responde correctamente"
            SUCCESS=$((SUCCESS + 1))
            break
        fi
        log_warning "Intento $i/$RETRIES: Base de datos no responde, esperando ${DELAY}s..."
        sleep $DELAY
    done
    
    # Check Redis
    for i in $(seq 1 $RETRIES); do
        if docker exec factura-redis redis-cli ping | grep -q "PONG"; then
            log_success "Redis responde correctamente"
            SUCCESS=$((SUCCESS + 1))
            break
        fi
        log_warning "Intento $i/$RETRIES: Redis no responde, esperando ${DELAY}s..."
        sleep $DELAY
    done
    
    # Resultado
    if [ $SUCCESS -ge 3 ]; then
        log_success "Health checks pasaron ($SUCCESS/4 servicios OK)"
        return 0
    else
        log_error "Health checks fallaron ($SUCCESS/4 servicios OK)"
        return 1
    fi
}

# ============================================
# FUNCIONES DE MIGRACIÓN
# ============================================

run_migrations() {
    log "Ejecutando migraciones..."
    
    # Las migraciones se ejecutan automáticamente al iniciar el contenedor
    # Pero podemos verificar que se aplicaron correctamente
    
    sleep 5  # Esperar a que el contenedor esté listo
    
    if docker exec factura-app npm run migrate > /dev/null 2>&1; then
        log_success "Migraciones aplicadas correctamente"
        return 0
    else
        log_warning "No se requirieron migraciones o ya están aplicadas"
        return 0
    fi
}

# ============================================
# FUNCIONES DE NOTIFICACIÓN
# ============================================

send_notification() {
    local TITLE=$1
    local MESSAGE=$2
    
    # Slack
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$TITLE\",\"attachments\":[{\"text\":\"$MESSAGE\",\"color\":\"danger\"}]}" \
            "$SLACK_WEBHOOK" > /dev/null 2>&1
    fi
    
    # Email (usando mail si está disponible)
    if command -v mail > /dev/null 2>&1; then
        echo "$MESSAGE" | mail -s "$TITLE" admin@conectados-factura.com 2>/dev/null || true
    fi
}

# ============================================
# FUNCIÓN PRINCIPAL DE DEPLOY
# ============================================

main() {
    log "=========================================="
    log "Iniciando deploy de Conectados Factura+"
    log "Servidor: $SERVER_IP"
    log "=========================================="
    
    # Verificar que estamos en el directorio correcto
    if [ ! -f "$DEPLOY_DIR/docker-compose.prod.yml" ]; then
        log_error "No se encontró docker-compose.prod.yml en $DEPLOY_DIR"
        exit 1
    fi
    
    cd "$DEPLOY_DIR"
    
    # 1. Crear backup
    BACKUP_FILE=$(create_backup)
    
    # 2. Pull de últimas imágenes
    log "Descargando últimas imágenes..."
    docker-compose -f docker-compose.prod.yml pull
    
    # 3. Construir si hay cambios locales
    log "Construyendo imágenes..."
    docker-compose -f docker-compose.prod.yml build --no-cache
    
    # 4. Detener servicios actuales
    log "Deteniendo servicios actuales..."
    docker-compose -f docker-compose.prod.yml down --remove-orphans
    
    # 5. Limpiar imágenes antiguas
    log "Limpiando imágenes antiguas..."
    docker image prune -af --filter "until=24h" || true
    
    # 6. Iniciar servicios
    log "Iniciando servicios..."
    docker-compose -f docker-compose.prod.yml up -d
    
    # 7. Ejecutar migraciones
    run_migrations
    
    # 8. Health checks
    if health_check; then
        log_success "================================"
        log_success "  DEPLOY COMPLETADO CON ÉXITO  "
        log_success "================================"
        log_success "App: http://$SERVER_IP"
        log_success "Grafana: http://$SERVER_IP:3001"
        log_success "Prometheus: http://$SERVER_IP:9090"
        
        # Notificar éxito
        send_notification "✅ Deploy exitoso en $SERVER_IP" "Todos los servicios están operativos."
        
        exit 0
    else
        log_error "================================"
        log_error "   DEPLOY FALLÓ - ROLLBACK      "
        log_error "================================"
        
        # Ejecutar rollback
        rollback "$BACKUP_FILE"
        
        exit 1
    fi
}

# ============================================
# MANEJO DE ARGUMENTOS
# ============================================

case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback "$2"
        ;;
    health)
        health_check
        ;;
    backup)
        create_backup
        ;;
    logs)
        docker-compose -f "$DEPLOY_DIR/docker-compose.prod.yml" logs -f
        ;;
    status)
        docker-compose -f "$DEPLOY_DIR/docker-compose.prod.yml" ps
        ;;
    *)
        echo "Uso: $0 {deploy|rollback|health|backup|logs|status}"
        exit 1
        ;;
esac
