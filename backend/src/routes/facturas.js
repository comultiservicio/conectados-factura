const express = require('express');
const authMiddleware = require('../middleware/auth');
const FacturaService = require('../services/FacturaService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', (req, res, next) => {
  try {
    res.json(FacturaService.list());
  } catch (error) {
    next(error);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const factura = FacturaService.getById(Number(req.params.id));
    if (!factura) {
      return res.status(404).json({ error: 'Factura not found' });
    }
    return res.json(factura);
  } catch (error) {
    return next(error);
  }
});

router.post('/', (req, res, next) => {
  try {
    const factura = FacturaService.create({
      ...req.body,
      user_id: req.user.id
    });
    res.status(201).json(factura);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const factura = FacturaService.update(Number(req.params.id), req.body || {});
    if (!factura) {
      return res.status(404).json({ error: 'Factura not found' });
    }
    return res.json(factura);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const removed = FacturaService.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: 'Factura not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;