const express = require('express');
const authMiddleware = require('../middleware/auth');
const AuthService = require('../services/AuthService');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
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