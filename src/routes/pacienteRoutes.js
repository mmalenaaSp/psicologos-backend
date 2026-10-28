const express = require('express');
const router = express.Router();

const {
  crearPaciente,
  obtenerPacientes,
  obtenerPacientePorId,
  actualizarPaciente,
  borrarPaciente
} = require('../controllers/pacienteController');

// CREATE
router.post('/', crearPaciente);

// READ
router.get('/', obtenerPacientes);
router.get('/:id', obtenerPacientePorId);

// UPDATE
router.put('/:id', actualizarPaciente);

// DELETE
router.delete('/:id', borrarPaciente);

module.exports = router;