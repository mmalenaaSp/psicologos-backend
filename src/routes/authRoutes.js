
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();

const {
  registrarUsuario,
  iniciarSesion,
  requerirSesion,
  obtenerMiCuenta,
  cerrarSesion
} = require('../controllers/authController');

const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos. Probá nuevamente más tarde.'
  }
});

const limitarRegistro = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Probá nuevamente más tarde.' }
});

router.post('/register', limitarRegistro, registrarUsuario);
router.post('/login', limitarLogin, iniciarSesion);
router.get('/me', requerirSesion, obtenerMiCuenta);
router.post('/logout', cerrarSesion);

module.exports = router;
