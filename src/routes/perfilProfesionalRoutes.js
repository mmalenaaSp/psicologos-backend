const express = require('express');
const c = require('../controllers/perfilProfesionalController');
const { requerirSesion } = require('../controllers/authController');
const { requerirRol, requerirPerfilCompleto } = require('../middleware/autorizacion');
const router = express.Router();
router.get('/mi-perfil/profesional', requerirSesion, requerirRol('PSICOLOGO'), requerirPerfilCompleto, c.obtenerPrivado);
router.patch('/mi-perfil/profesional', requerirSesion, requerirRol('PSICOLOGO'), requerirPerfilCompleto, c.guardarPrivado);
module.exports = router;
