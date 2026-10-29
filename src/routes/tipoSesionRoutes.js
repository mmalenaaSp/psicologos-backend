const express = require('express');
const {
  crearTipoSesion,
  obtenerTiposSesion,
  obtenerTipoSesionPorId,
  actualizarTipoSesion,
  borrarTipoSesion
} = require('../controllers/tipoSesionController');

const router = express.Router();

router.post('/', crearTipoSesion);
router.get('/', obtenerTiposSesion);
router.get('/:id', obtenerTipoSesionPorId);
router.put('/:id', actualizarTipoSesion);
router.delete('/:id', borrarTipoSesion);

module.exports = router;
