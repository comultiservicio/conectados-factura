# Dockerfile para Conectados Factura+ Frontend
# Multi-stage build para optimizar tamaño de imagen

# Etapa 1: Build
FROM node:18-alpine AS builder

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production=false

# Copiar código fuente
COPY . .

# Construir aplicación
RUN npm run build

# Etapa 2: Producción
FROM node:18-alpine

# Instalar serve para servir archivos estáticos
RUN npm install -g serve

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos construidos desde etapa builder
COPY --from=builder /app/dist ./dist

# Copiar assets necesarios para Electron (si aplica)
COPY --from=builder /app/assets ./assets

# Exponer puerto 3000
EXPOSE 3000

# Comando de inicio: sirve archivos estáticos en puerto 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
