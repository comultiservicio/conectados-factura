# Changelog - Conectados Factura+ v2.0.0

## 🚀 Release v2.0.0 - Local-First Architecture

**Fecha**: Mayo 2026  
**Branch**: main  
**Tag**: v2.0.0

---

## ✅ Problemas Críticos Resueltos

### PROBLEMA 1: Limpiar main de historial AWS ✅
- **Estado**: Resuelto
- **Acción**: Merge limpio de `deploy-docker` → `main`
- **Resultado**: `main` contiene solo código local (backend/, frontend/, desktop/)
- **Commit**: `e3b6a4c6`

### PROBLEMA 2: Eliminar SQLite del repo ✅
- **Estado**: Resuelto
- **Acción**: `git rm backend/data/*.db` + `.gitignore` actualizado
- **Resultado**: Archivos de base de datos eliminados del repositorio
- **Commit**: `edca166e fix(git): remove SQLite files from repo - production data security`

### PROBLEMA 3: Vulnerabilidades npm ✅
- **Estado**: Resuelto
- **Acción**: `npm audit` verificado
- **Resultado**: `found 0 vulnerabilities`

### PROBLEMA 4: Test de integración real ✅
- **Estado**: Resuelto
- **Acción**: Creado `scripts/test-production.js`
- **Tests**: 8/8 tests end-to-end
  - Health check
  - Login
  - Crear producto
  - Crear cliente
  - Abrir caja
  - Crear factura
  - Verificar integridad
  - Cerrar caja
- **Commit**: `c73b40ae feat(setup): add secure env setup script and integration tests`

### PROBLEMA 5: Limpiar tags viejos ✅
- **Estado**: Resuelto
- **Acción**: Eliminado `v1.0.0` (apuntaba a código AWS viejo)
- **Resultado**: Solo existe `v2.0.0` en local y remoto

---

## 📦 Nuevos Archivos de Producción

| Archivo | Descripción |
|---------|-------------|
| `backend/scripts/setup.js` | Genera JWT_SECRET automáticamente |
| `scripts/test-production.js` | Test de integración 8/8 |
| `backend/.env.example` | Template de configuración |
| `PRODUCTION.md` | Guía completa de instalación |
| `backend/data/.gitkeep` | Mantiene directorio vacío en git |

---

## 🔒 Seguridad Implementada

- ✅ JWT_SECRET requerido (sin fallback)
- ✅ CORS restringido en producción
- ✅ Rate limiting en login (5 intentos/15 min)
- ✅ Graceful shutdown con cleanup
- ✅ Backup integrity verification
- ✅ Promise queue recovery
- ✅ SQLite files ignorados por git

---

## 📊 Estado Final del Repo

```bash
# Tags
$ git tag -l
v2.0.0

# Historial limpio
$ git log --oneline -5
e7aae113 docs(production): add test-production.js verification
edca166e fix(git): remove SQLite files from repo
c73b40ae feat(setup): add secure env setup and integration tests
e3b6a4c6 release(v2.0.0): local-first architecture replaces AWS cloud

# Sin vulnerabilidades
$ npm audit
found 0 vulnerabilities

# Sin archivos SQLite en repo
$ git ls-files | grep "\.db"
# (vacío)
```

---

## 🚀 Instrucciones para Producción

```bash
# 1. Clonar
git clone https://github.com/comultiservicio/conectados-factura.git
cd conectados-factura
git checkout main

# 2. Setup inicial
cd backend
node scripts/setup.js  # Genera .env con JWT_SECRET seguro

# 3. Instalar dependencias
cd ..
npm install

# 4. Verificar con tests
cd backend && npm start &
cd scripts && node test-production.js
# Esperar: 🎉 TODOS LOS TESTS PASARON (8/8)

# 5. Iniciar frontend
cd frontend && npm run dev
```

---

## 📝 Notas para Desarrolladores

### Setup de Desarrollo
```bash
# Generar JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Verificar estado
npm audit
git log --oneline -10
curl http://localhost:3001/api/health
```

### Estructura Limpia
- ✅ `backend/` - API Express + SQLite
- ✅ `frontend/` - React + Vite
- ✅ `desktop/` - Electron con backend embebido
- ✅ `mobile/` - React Native
- ✅ `shared/` - Tipos comunes
- ✅ `installer/` - Scripts de build
- ❌ `lambda/` - Eliminado (código AWS viejo)
- ❌ `infrastructure/` - Eliminado (CDK AWS viejo)

---

## 📞 Soporte

- **Email**: soporteco@chathannah.uk
- **Versión**: 2.0.0
- **Estado**: ✅ Listo para producción

---

*Conectados Multiservicio - Todos los derechos reservados*
