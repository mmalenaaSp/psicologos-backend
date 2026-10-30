const crearCrudCatalogo = require('./catalogoCrud');

module.exports = crearCrudCatalogo({
  modelo: 'colegioPsicologo',
  campos: ['distrito', 'nombre', 'direccion'],
  relaciones: ['psicologos']
});