const express = require('express');
const {
  crearLugar,
  obtenerLugares,
  obtenerLugarPorId,
  actualizarLugar,
  borrarLugar
} = require('../controllers/lugarController');

const router = express.Router();

router.post('/', crearLugar);
router.get('/', obtenerLugares);
router.get('/:id', obtenerLugarPorId);
router.put('/:id', actualizarLugar);
router.delete('/:id', borrarLugar);

module.exports = router;
