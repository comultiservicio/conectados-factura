const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbConnection = require('../database/connection');
const config = require('../config');

class AuthService {
  constructor() {
    this.db = dbConnection.getInstance();
  }

  async register({ email, password, name, role }) {
    if (!email || !password || !name) {
      const err = new Error('email, password and name are required');
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      const err = new Error('User already exists');
      err.statusCode = 409;
      throw err;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const selectedRole = role || 'vendedor';

    const result = this.db.prepare(`
      INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(normalizedEmail, password_hash, name, selectedRole);

    const user = this.db.prepare(`
      SELECT id, email, name, role
      FROM users
      WHERE id = ?
    `).get(result.lastInsertRowid);

    const token = this.signToken(user);
    return {
      token,
      expiresIn: config.jwtExpiresIn,
      user
    };
  }

  async login({ email, password }) {
    if (!email || !password) {
      const err = new Error('email and password are required');
      err.statusCode = 400;
      throw err;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userRow = this.db.prepare(`
      SELECT id, email, name, role, password_hash, active
      FROM users
      WHERE email = ?
    `).get(normalizedEmail);

    if (!userRow || Number(userRow.active) !== 1) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    const validPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!validPassword) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role
    };

    const token = this.signToken(user);
    return {
      token,
      expiresIn: config.jwtExpiresIn,
      user
    };
  }

  signToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }

  verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
  }
}

module.exports = new AuthService();