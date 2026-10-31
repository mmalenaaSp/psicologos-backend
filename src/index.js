require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors'); // herramienta de seguridad
const app = express(); // app va a ser el servidor
const PORT = process.env.PORT || 3000;
const cookieParser = require('cookie-parser');

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

const authRoutes = require('./routes/authRoutes');

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(cookieParser());

// Comprobación básica de origen para solicitudes
// que modifican datos desde el navegador.
app.use((req, res, next) => {
  const metodos = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (metodos.includes(req.method)) {
    const origen = req.get('Origin');
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Enviá los datos como application/json.' });
    }

    if (origen && origen !== FRONTEND_URL) {
      return res.status(403).json({
        error: 'Origen no permitido.'
      });
    }
  }

  next();
});


const { requerirSesion } = require('./controllers/authController');
const { requerirRol, requerirPerfilCompleto } = require('./middleware/autorizacion');
const perfilController = require('./controllers/perfilController');
app.use('/api/auth', authRoutes);
app.get('/api/mi-perfil/opciones', requerirSesion, perfilController.opcionesPerfil);
app.get('/api/mi-perfil', requerirSesion, perfilController.obtenerMiPerfil);
app.put('/api/mi-perfil', requerirSesion, perfilController.guardarMiPerfil);
app.use('/api/liquidaciones', require('./routes/liquidacionRoutes'));
app.use('/api', require('./routes/perfilProfesionalRoutes'));
app.use('/api', require('./routes/turnoRoutes'));
// El perfil incompleto sólo habilita su propio onboarding, nunca los CRUD.
app.use('/api', requerirSesion, requerirRol('PSICOLOGO'), requerirPerfilCompleto);
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

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = [400, 413].includes(error.status) ? error.status : 500;
  res.status(status).json({ error: status === 400 ? 'JSON inválido.' : 'Error interno del servidor.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
}
module.exports = app;
