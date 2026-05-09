FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p /app/data

COPY package*.json ./
RUN npm ci --production

COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]