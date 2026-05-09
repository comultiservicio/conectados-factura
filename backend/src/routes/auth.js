const express = require('express');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const AuthService = require('../services/AuthService');

const router = express.Router();

/**
 * ERROR 8 FIX: Rate limiting para prevenir brute force
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por ventana
  message: {
    success: false,
    error: 'Demasiados intentos. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: false
});

router.post('/register', async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Login con rate limiting - 5 intentos cada 15 minutos
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    }
  });
});

module.exports = router;