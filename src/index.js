const express = require('express');
const cors = require('cors'); // herramienta de seguridad
const app = express(); // app va a ser el servidor
const PORT = process.env.PORT || 3000;

// 1. IMPORTACIÓN DE RUTAS
// Psicólogos y Pacientes
const psicologoRoutes = require('./routes/psicologoRoutes');
const pacienteRoutes = require('./routes/pacienteRoutes');

// Tipos de Sesión y Lugares
const tipoSesionRoutes = require('./routes/tipoSesionRoutes');
const lugarRoutes = require('./routes/lugarRoutes');

// Colegios y Obras Sociales
const colegioPsicologoRoutes = require('./routes/colegioPsicologoRoutes');
const obraSocialRoutes = require('./routes/obraSocialRoutes');

app.use(cors()); 
app.use(express.json()); // traduce el texto a un objeto JSON


// 2. REGISTRO DE ENDPOINTS DE LA API
// Psicólogos
app.use('/api/psicologos', psicologoRoutes);
app.use('/api/pacientes', pacienteRoutes);
app.use('/api/tipos-sesion', tipoSesionRoutes);
app.use('/api/lugares', lugarRoutes);
app.use('/api/colegios', colegioPsicologoRoutes);
app.use('/api/obras-sociales', obraSocialRoutes);

app.get('/', (req, res) => { // ruta de prueba
  res.send('Servidor de PsycoGest funcionando correctamente 🚀');
});

app.listen(PORT, () => {  // prende el servidor
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
