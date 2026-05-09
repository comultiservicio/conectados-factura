# Conectados Factura+ - Deploy Guide

## 🔧 Cleanup (Fix Port Conflicts)

### 1. Stop and Remove Old Containers
```bash
# Stop old container using port 3000
docker rm -f conectados-factura-app

# Remove any orphaned containers
docker compose down --remove-orphans

# Prune unused images and volumes (optional)
docker system prune -f
docker volume prune -f
```

### 2. Verify No Port Conflicts
```bash
# Check if ports are free
netstat -tlnp | grep -E '3000|3001'
# or
ss -tlnp | grep -E '3000|3001'
```

---

## 🚀 Start Services

### Build and Start All Services
```bash
# Clean start
docker compose down --remove-orphans
docker compose up -d --build
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f db
```

---

## ✅ Verify Services

### Test Frontend
```bash
curl http://localhost:3000
# Should return HTML
```

### Test Backend Health
```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Test Backend API
```bash
# Login endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'
```

### Check Running Containers
```bash
docker ps

# Expected output:
# conectados-factura-frontend  Up ...  0.0.0.0:3000->3000/tcp
# conectados-factura-backend   Up ...  0.0.0.0:3001->3001/tcp
# conectados-factura-db        Up ...  0.0.0.0:3306->3306/tcp
```

---

## 🌐 Cloudflare Tunnel Setup

### 1. Install cloudflared
```bash
# Download and install
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

### 2. Authenticate
```bash
cloudflared tunnel login
# This will open browser to authenticate with Cloudflare
```

### 3. Create Tunnel
```bash
cloudflared tunnel create conectados-factura
# Save the Tunnel ID shown in output
```

### 4. Update Config
Edit `cloudflared/config.yml`:
- Replace `<TUNNEL_ID>` with your actual tunnel ID
- Place credentials file in `~/.cloudflared/<TUNNEL_ID>.json`

### 5. Copy Certificate (if using custom origin cert)
```bash
# Download from Cloudflare dashboard
# Place at: ~/.cloudflared/cert.pem
```

### 6. Run Tunnel
```bash
# Test mode
cloudflared tunnel --config cloudflared/config.yml run

# Production (as service)
cloudflared service install
systemctl start cloudflared
```

---

## 📋 Architecture

```
┌─────────────────────────────────────────┐
│           Cloudflare Tunnel             │
│              chathannah.uk              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Docker Network                │
│         (factura-net)                   │
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │  Frontend   │◄───│   Backend   │    │
│  │   :3000     │    │   :3001     │    │
│  │  (Vite)     │    │  (Node.js)  │    │
│  └─────────────┘    └──────┬──────┘    │
│                            │            │
│                       ┌────┴────┐       │
│                       │  SQLite │       │
│                       │  /data  │       │
│                       │(persist)│       │
│                       └─────────┘       │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Find process using port
sudo lsof -i :3000
sudo lsof -i :3001

# Kill process
kill -9 <PID>
```

### Container Won't Start
```bash
# Check logs
docker compose logs <service-name>

# Restart specific service
docker compose restart frontend
docker compose restart backend
```

### Backend Can't Connect to DB
```bash
# Check if DB is healthy
docker compose ps

# Check DB logs
docker compose logs db

# Test DB connection from backend container
docker exec -it conectados-factura-backend sh
wget -qO- http://db:3306
```

### Frontend Can't Reach Backend
```bash
# Test from frontend container
docker exec -it conectados-factura-frontend sh
wget -qO- http://backend:3001/api/health
```

---

## 📁 File Structure

```
d:
└── PROYECTOS/
    └── SISTEMA DE FACTURACION/
        ├── docker-compose.yml          # ✅ Main orchestration
        ├── cloudflared/
        │   └── config.yml                # ✅ Tunnel config
        ├── frontend/
        │   ├── Dockerfile
        │   └── src/
        ├── backend/
        │   ├── Dockerfile
        │   └── src/
        └── DEPLOY.md                     # ✅ This file
```

---

## 📝 Environment Variables

### Frontend
- `VITE_API_URL=http://backend:3001` - Backend API URL (Docker internal)

### Backend
- `PORT=3001` - Server port
- `JWT_SECRET=your-secret` - JWT signing key
- `DB_PATH=/app/data/factura.db` - SQLite database path

### Database
- `MYSQL_ROOT_PASSWORD=root_password`
- `MYSQL_DATABASE=factura_db`
- `MYSQL_USER=factura_user`
- `MYSQL_PASSWORD=factura_password`

---

## 🔄 Updates & Maintenance

### Rebuild After Code Changes
```bash
# Rebuild specific service
docker compose up -d --build frontend
docker compose up -d --build backend

# Rebuild all
docker compose up -d --build
```

### Backup Database
```bash
# Backup SQLite
docker exec conectados-factura-backend sh -c "cp /app/data/factura.db /app/data/factura-$(date +%Y%m%d).db"

# Copy to host
docker cp conectados-factura-backend:/app/data/factura-20260101.db ./backup/
```

### View Resource Usage
```bash
docker stats
```
