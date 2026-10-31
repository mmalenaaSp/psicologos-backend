const express = require('express');
const { envolver, prisma, serial, id, cuerpo, fallar } = require('../controllers/turnoController');
const { requerirSesion } = require('../controllers/authController');
const { requerirRol, requerirPerfilCompleto } = require('../middleware/autorizacion');
const router = express.Router();
const select = { id: true, valorTotal: true, fechaEmision: true, estado: true, obraSocial: { select: { id: true, nombre: true } }, detalles: { select: { turnoId: true, importe: true, sesion: true, fechaSesion: true, paciente: true } } };
router.use(requerirSesion, requerirRol('PSICOLOGO'), requerirPerfilCompleto);
router.get('/', envolver(async (req, res) => {
  const where = { psicologoId: req.usuario.psicologoId };
  if (req.query.obraSocialId) where.obraSocialId = id(req.query.obraSocialId);
  if (req.query.estado) {
    if (!['PENDIENTE','PAGADA'].includes(req.query.estado)) fallar(400, 'Estado inválido.');
    where.estado = req.query.estado;
  }
  res.json(await prisma.liquidacion.findMany({ where, select, orderBy: { fechaEmision: 'desc' } }));
}));
router.post('/', envolver(async (req, res) => {
  cuerpo(req.body, ['obraSocialId', 'detalles']);
  const obraSocialId = id(req.body.obraSocialId);
  if (!Array.isArray(req.body.detalles) || !req.body.detalles.length || req.body.detalles.length > 100) fallar(400, 'Ingresá entre 1 y 100 sesiones con importes explícitos.');
  const vistos = new Set();
  const detalles = req.body.detalles.map(d => {
    cuerpo(d, ['turnoId','importe']);
    const turnoId = id(d.turnoId);
    if (vistos.has(turnoId)) fallar(400, 'No repitas sesiones.');
    vistos.add(turnoId);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(d.importe))) fallar(400, 'Importe inválido. Usá hasta dos decimales.');
    const [entero, decimal = ''] = String(d.importe).split('.');
    const centavos = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
    if (centavos <= 0) fallar(400, 'El importe debe ser positivo.');
    return { turnoId, centavos };
  });
  const total = detalles.reduce((s, d) => s + d.centavos, 0);
  if (total > 9999999999) fallar(400, 'El total excede el máximo permitido.');
  const resultado = await serial(async tx => {
    const profesional = await tx.psicologo.findFirst({ where: { id: req.usuario.psicologoId, obrasSociales: { some: { id: obraSocialId } } }, select: { id: true } });
    if (!profesional) fallar(400, 'La obra social no está vinculada a tu perfil.');
    const registros = [];
    for (const d of detalles) {
      const t = await tx.turno.findFirst({ where: { id: d.turnoId, psicologoId: req.usuario.psicologoId, estado: 'RESERVADO', paciente: { is: { obraSocialId } } }, include: { tipoSesion: true, paciente: { select: { nombre: true, apellido: true } } } });
      if (!t) fallar(400, 'La sesión no corresponde a tu espacio o a esa obra social.');
      registros.push({ turnoId: t.id, importe: (d.centavos / 100).toFixed(2), sesion: t.tipoSesion.nombre, fechaSesion: t.fecha, paciente: `${t.paciente.nombre} ${t.paciente.apellido}` });
    }
    return tx.liquidacion.create({ data: { psicologoId: req.usuario.psicologoId, obraSocialId, estado: 'PENDIENTE', valorTotal: (total / 100).toFixed(2), detalles: { create: registros } }, select });
  });
  res.status(201).json(resultado);
}));
router.patch('/:id/pagar', envolver(async (req, res) => {
  cuerpo(req.body, []);
  const result = await prisma.liquidacion.updateMany({ where: { id: id(req.params.id), psicologoId: req.usuario.psicologoId, estado: 'PENDIENTE' }, data: { estado: 'PAGADA' } });
  if (!result.count) fallar(404, 'Liquidación pendiente no encontrada.');
  res.json({ mensaje: 'Pago registrado. Los importes históricos se conservan.' });
}));
module.exports = router;
