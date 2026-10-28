const express = require('express');
const cors = require('cors'); // herramienta de seguridad

const app = express(); // app va a ser el servidor
const PORT = process.env.PORT || 3000;

// 1. IMPORTACIÓN: Traemos el archivo de rutas que vas a crear
const psicologoRoutes = require('./routes/psicologoRoutes');
const pacienteRoutes = require('./routes/pacienteRoutes');

app.use(cors()); 
app.use(express.json()); // traduce el texto a un objeto JSON

// 2. CONEXIÓN: Atamos la URL '/api/psicologos' a tus rutas
app.use('/api/psicologos', psicologoRoutes);
app.use('/api/pacientes', pacienteRoutes);

app.get('/', (req, res) => { // ruta de prueba
  res.send('Servidor de PsycoGest funcionando correctamente 🚀');
});

app.listen(PORT, () => {  // prende el servidor
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});