const { PrismaClient } = require('@prisma/client');
const { crearServicioPerfilProfesional, ErrorPerfilProfesional } = require('../services/perfilProfesional');
const servicio = crearServicioPerfilProfesional(new PrismaClient());
const manejar = fn => async (req, res) => {
  try { return res.json(await fn(req)); }
  catch (error) {
    if (error instanceof ErrorPerfilProfesional) return res.status(error.status).json({ error: error.message });
    if (['P2025', 'P2034'].includes(error.code)) return res.status(409).json({ error: 'El perfil cambió. Actualizá y volvé a intentar.' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'El lugar seleccionado ya no está disponible.' });
    console.error('Perfil profesional:', error.code || error.name);
    return res.status(500).json({ error: 'No se pudo completar la operación del perfil profesional.' });
  }
};
module.exports = {
  obtenerPrivado: manejar(req => servicio.obtenerPrivado(req.usuario)),
  guardarPrivado: manejar(req => servicio.guardarPrivado(req.usuario, req.body)),
  obtenerPublico: manejar(req => servicio.obtenerPublico(req.params.id)),
};
