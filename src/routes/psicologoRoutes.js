const express = require('express');
const router = express.Router();

// Importamos las funciones terminadas desde tu controlador
const { 
  crearPsicologo, 
  obtenerPsicologos, 
  obtenerPsicologoPorId,
  actualizarPsicologo, 
  borrarPsicologo 
} = require('../controllers/psicologoController'); // Ajustá la ruta según tus carpetas

// Definimos los endpoints (URLs) y los atamos a su verbo HTTP y su función
router.post('/', crearPsicologo);
router.get('/', obtenerPsicologos);
router.put('/:id', actualizarPsicologo);
router.delete('/:id', borrarPsicologo);
router.get('/:id', obtenerPsicologoPorId);

// Exportamos el router para que el archivo principal de tu app lo pueda usar
module.exports = router;