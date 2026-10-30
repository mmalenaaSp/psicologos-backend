const crearCrudCatalogo = require('./catalogoCrud');

module.exports = crearCrudCatalogo({
  modelo: 'obraSocial',
  campos: ['codigo', 'nombre'],
  relaciones: ['pacientes', 'psicologos', 'liquidaciones']
});