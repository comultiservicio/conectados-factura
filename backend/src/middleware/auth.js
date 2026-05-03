/**
 * Middleware de Autenticación JWT con Roles
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'conectados-factura-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Genera hash de contraseña
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<string>} Hash bcrypt
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifica contraseña
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash almacenado
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Genera token JWT
 * @param {Object} user - Datos del usuario
 * @returns {string} Token JWT
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Middleware: Verificar token JWT
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Acceso denegado',
      message: 'Token no proporcionado'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      error: 'Token inválido',
      message: error.message
    });
  }
}

/**
 * Middleware: Verificar rol específico
 * @param {...string} allowedRoles - Roles permitidos
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Debe iniciar sesión primero'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `Rol '${req.user.role}' no tiene permisos para esta acción`,
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware: Verificar propiedad o admin
 * Útil para que usuarios solo modifiquen sus propios recursos
 */
function requireOwnerOrAdmin(getResourceOwnerId) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Admin puede todo
    if (req.user.role === 'admin') {
      return next();
    }

    // Obtener ID del propietario del recurso
    const ownerId = await getResourceOwnerId(req);
    
    if (ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No es propietario del recurso'
      });
    }

    next();
  };
}

/**
 * Servicio de Autenticación
 */
class AuthService {
  constructor() {
    this.db = db.getInstance();
  }

  /**
   * Iniciar sesión
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña
   * @returns {Promise<Object>} Token y datos del usuario
   */
  async login(email, password) {
    const stmt = this.db.prepare(`
      SELECT id, email, password, role, name, active
      FROM users
      WHERE email = ? AND active = 1
    `);

    const user = stmt.get(email);

    if (!user) {
      throw new Error('Usuario no encontrado o inactivo');
    }

    const isValidPassword = await verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      throw new Error('Contraseña incorrecta');
    }

    // Actualizar último login
    const updateStmt = this.db.prepare(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    `);
    updateStmt.run(user.id);

    // Generar token
    const token = generateToken(user);

    // No devolver password
    const { password: _, ...userWithoutPassword } = user;

    return {
      token,
      user: userWithoutPassword,
      expiresIn: JWT_EXPIRES_IN
    };
  }

  /**
   * Registrar nuevo usuario (solo admin)
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Usuario creado
   */
  async register(userData) {
    const { email, password, role, name } = userData;

    // Validar rol
    const validRoles = ['admin', 'vendedor', 'chofer', 'contador'];
    if (!validRoles.includes(role)) {
      throw new Error(`Rol inválido. Roles permitidos: ${validRoles.join(', ')}`);
    }

    // Verificar si email existe
    const checkStmt = this.db.prepare('SELECT id FROM users WHERE email = ?');
    const existing = checkStmt.get(email);

    if (existing) {
      throw new Error('El email ya está registrado');
    }

    // Hashear password
    const hashedPassword = await hashPassword(password);

    // Insertar usuario
    const insertStmt = this.db.prepare(`
      INSERT INTO users (email, password, role, name)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertStmt.run(email, hashedPassword, role, name);

    return {
      id: result.lastInsertRowid,
      email,
      role,
      name,
      message: 'Usuario creado exitosamente'
    };
  }

  /**
   * Cambiar contraseña
   * @param {number} userId - ID del usuario
   * @param {string} currentPassword - Contraseña actual
   * @param {string} newPassword - Nueva contraseña
   */
  async changePassword(userId, currentPassword, newPassword) {
    const stmt = this.db.prepare('SELECT password FROM users WHERE id = ?');
    const user = stmt.get(userId);

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Contraseña actual incorrecta');
    }

    const hashedNewPassword = await hashPassword(newPassword);
    
    const updateStmt = this.db.prepare(`
      UPDATE users SET password = ? WHERE id = ?
    `);
    updateStmt.run(hashedNewPassword, userId);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  /**
   * Listar usuarios (solo admin)
   */
  listUsers(filters = {}) {
    let query = `
      SELECT id, email, role, name, active, last_login, created_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }

    if (filters.active !== undefined) {
      query += ' AND active = ?';
      params.push(filters.active ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Desactivar usuario (soft delete)
   * @param {number} userId - ID del usuario a desactivar
   */
  async deactivateUser(userId) {
    const stmt = this.db.prepare(`
      UPDATE users SET active = 0 WHERE id = ?
    `);
    stmt.run(userId);
    return { message: 'Usuario desactivado' };
  }
}

module.exports = {
  AuthService: new AuthService(),
  authenticateToken,
  requireRole,
  requireOwnerOrAdmin,
  hashPassword,
  verifyPassword,
  generateToken,
  JWT_SECRET
};
