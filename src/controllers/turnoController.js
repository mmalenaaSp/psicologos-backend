const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { seleccionCamposPublicos } = require('../services/perfilProfesional');
class ErrorNegocio extends Error { constructor(status, message) { super(message); this.status = status; } }
const fallar = (status, message) => { throw new ErrorNegocio(status, message); };
function id(valor) {
  if (!['string', 'number'].includes(typeof valor) || !/^[1-9]\d*$/.test(String(valor)) || Number(valor) > 2147483647) fallar(400, 'Identificador inválido.');
  return Number(valor);
}
function fecha(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) fallar(400, 'Fecha inválida.');
  const result = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(+result) || result.toISOString().slice(0, 10) !== valor) fallar(400, 'Fecha inválida.');
  return result;
}
function hora(valor) {
  if (typeof valor !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)) fallar(400, 'Hora inválida.');
  return new Date(`1970-01-01T${valor}:00Z`);
}
function inicio(t) { return new Date(`${t.fecha.toISOString().slice(0,10)}T${t.horaIni.toISOString().slice(11,19)}-03:00`); }
function futuro(t) { if (inicio(t) <= new Date()) fallar(409, 'El turno ya comenzó o está en el pasado.'); }
function cuerpo(body, campos) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !campos.includes(k))) fallar(400, 'Campos no permitidos.');
}
const nombre = { id: true, nombre: true, apellido: true };
const seleccion = {
  id: true, fecha: true, horaIni: true, horaFin: true, estado: true, modalidad: true,
  psicologo: { select: { ...nombre, nroMatricula: true } },
  tipoSesion: { select: { id: true, nombre: true, precioBase: true } },
  lugar: { select: { id: true, nombre: true, direccion: true } },
};
function salida(t) { return { ...t, fecha: t.fecha.toISOString().slice(0,10), horaIni: t.horaIni.toISOString().slice(11,16), horaFin: t.horaFin.toISOString().slice(11,16), inicio: inicio(t).toISOString() }; }
const publico = { activo: true, usuario: { is: { estado: 'ACTIVO', rol: 'PSICOLOGO' } } };
async function disponibles() {
  const dia = fecha(new Date(Date.now() - 3 * 3600000).toISOString().slice(0,10));
  const rows = await prisma.turno.findMany({ where: { estado: 'DISPONIBLE', pacienteId: null, fecha: { gte: dia } }, select: { id: true, fecha: true, horaIni: true } });
  return { id: { in: rows.filter(t => inicio(t) > new Date()).map(t => t.id) }, estado: 'DISPONIBLE', pacienteId: null };
}
const envolver = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    const conflicto = ['P2034', 'P2025', 'P2002'].includes(error.code);
    const status = error.status || (conflicto ? 409 : error.code === 'P2003' ? 400 : 500);
    if (status === 500) console.error('Operación de agenda:', error.code || error.name);
    res.status(status).json({ error: error.status ? error.message : conflicto ? 'El recurso cambió. Actualizá y volvé a intentar.' : 'No se pudo completar la operación.' });
  }
};
async function serial(fn) { return prisma.$transaction(fn, { isolationLevel: 'Serializable' }); }
async function bloquear(tx, psicologoId) {
  // Todas las mutaciones de agenda toman primero el mismo bloqueo por profesional.
  await tx.$queryRaw`SELECT id FROM Psicologo WHERE id = ${psicologoId} FOR UPDATE`;
}
async function validarTurno(tx, body, usuario) {
  cuerpo(body, ['fecha', 'horaIni', 'horaFin', 'tipoSesionId', 'modalidad', 'lugarId']);
  const data = { fecha: fecha(body.fecha), horaIni: hora(body.horaIni), horaFin: hora(body.horaFin), tipoSesionId: id(body.tipoSesionId), modalidad: body.modalidad, lugarId: body.lugarId == null ? null : id(body.lugarId) };
  if (data.horaFin <= data.horaIni) fallar(400, 'La hora de fin debe ser posterior al inicio.');
  futuro(data);
  if (!['PRESENCIAL', 'VIRTUAL'].includes(data.modalidad)) fallar(400, 'Modalidad inválida.');
  if (data.modalidad === 'PRESENCIAL' && !data.lugarId) fallar(400, 'Seleccioná un lugar de atención.');
  if (data.modalidad === 'VIRTUAL' && data.lugarId) fallar(400, 'Una sesión virtual no lleva lugar presencial.');
  const accesible = { OR: [{ propietarioId: usuario.id }, { propietarioId: null }] };
  if (!await tx.tipoSesion.findFirst({ where: { id: data.tipoSesionId, ...accesible } })) fallar(400, 'Tipo de sesión no disponible.');
  if (data.lugarId && !await tx.lugar.findFirst({ where: { id: data.lugarId, ...accesible } })) fallar(400, 'Lugar no disponible.');
  return data;
}
async function sinSuperposicion(tx, psicologoId, data, excluir) {
  // Bajo el bloqueo del profesional: comparar TIME en JS evita coerciones del driver MySQL.
  const rows = await tx.turno.findMany({ where: { psicologoId, fecha: data.fecha, estado: { not: 'CANCELADO' } }, select: { id: true, horaIni: true, horaFin: true } });
  if (rows.some(t => t.id !== excluir && t.horaIni < data.horaFin && t.horaFin > data.horaIni)) fallar(409, 'El horario se superpone con otro turno.');
}
const listar = envolver(async (req, res) => {
  const profesional = req.usuario.rol === 'PSICOLOGO';
  const where = profesional ? { psicologoId: req.usuario.psicologoId } : { pacienteId: req.usuario.pacienteId };
  if (req.query.fecha) where.fecha = fecha(req.query.fecha);
  if (req.query.estado) {
    if (!['DISPONIBLE','RESERVADO','CANCELADO'].includes(req.query.estado)) fallar(400, 'Estado inválido.');
    where.estado = req.query.estado;
  }
  const turnos = await prisma.turno.findMany({ where, select: { ...seleccion, ...(profesional ? { paciente: { select: nombre } } : {}) }, orderBy: [{ fecha: 'asc' }, { horaIni: 'asc' }] });
  res.json(turnos.map(salida));
});
const crear = envolver(async (req, res) => {
  const resultado = await serial(async tx => {
    await bloquear(tx, req.usuario.psicologoId);
    const data = await validarTurno(tx, req.body, req.usuario);
    await sinSuperposicion(tx, req.usuario.psicologoId, data);
    return tx.turno.create({ data: { ...data, psicologoId: req.usuario.psicologoId, estado: 'DISPONIBLE' }, select: seleccion });
  });
  res.status(201).json(salida(resultado));
});
const editar = envolver(async (req, res) => {
  const turnoId = id(req.params.id);
  const resultado = await serial(async tx => {
    await bloquear(tx, req.usuario.psicologoId);
    const actual = await tx.turno.findFirst({ where: { id: turnoId, psicologoId: req.usuario.psicologoId } });
    if (!actual) fallar(404, 'Turno no encontrado.');
    if (actual.estado !== 'DISPONIBLE' || actual.pacienteId) fallar(409, 'Sólo se modifican horarios libres.');
    futuro(actual);
    const data = await validarTurno(tx, req.body, req.usuario);
    await sinSuperposicion(tx, req.usuario.psicologoId, data, turnoId);
    return tx.turno.update({ where: { id: turnoId }, data, select: seleccion });
  });
  res.json(salida(resultado));
});
const eliminar = envolver(async (req, res) => {
  await serial(async tx => {
    await bloquear(tx, req.usuario.psicologoId);
    const t = await tx.turno.findFirst({ where: { id: id(req.params.id), psicologoId: req.usuario.psicologoId } });
    if (!t) fallar(404, 'Turno no encontrado.');
    if (t.estado !== 'DISPONIBLE' || t.pacienteId) fallar(409, 'Sólo se eliminan horarios libres.');
    futuro(t);
    await tx.turno.delete({ where: { id: t.id } });
  });
  res.status(204).end();
});
const reservar = envolver(async (req, res) => {
  cuerpo(req.body, []);
  await serial(async tx => {
    const t = await tx.turno.findFirst({ where: { id: id(req.params.id), psicologo: publico } });
    if (!t) fallar(404, 'Turno no encontrado.');
    await bloquear(tx, t.psicologoId);
    futuro(t);
    const resultado = await tx.turno.updateMany({ where: { id: t.id, estado: 'DISPONIBLE', pacienteId: null }, data: { estado: 'RESERVADO', pacienteId: req.usuario.pacienteId } });
    if (resultado.count !== 1) fallar(409, 'El horario ya no está disponible.');
  });
  res.json({ mensaje: 'Reserva confirmada.' });
});
const cancelar = envolver(async (req, res) => {
  cuerpo(req.body, []);
  const profesional = req.usuario.rol === 'PSICOLOGO';
  await serial(async tx => {
    const where = { id: id(req.params.id), ...(profesional ? { psicologoId: req.usuario.psicologoId } : { pacienteId: req.usuario.pacienteId }) };
    const t = await tx.turno.findFirst({ where });
    if (!t) fallar(404, 'Turno no encontrado.');
    await bloquear(tx, t.psicologoId);
    futuro(t);
    if (t.estado !== 'RESERVADO') fallar(409, 'El turno no está reservado.');
    const resultado = await tx.turno.updateMany({ where: { ...where, estado: 'RESERVADO', pacienteId: t.pacienteId }, data: profesional ? { estado: 'CANCELADO' } : { estado: 'DISPONIBLE', pacienteId: null } });
    if (resultado.count !== 1) fallar(409, 'La reserva cambió. Actualizá la agenda.');
  });
  res.json({ mensaje: profesional ? 'Turno cancelado.' : 'Reserva cancelada; horario liberado.' });
});
const buscar = envolver(async (req, res) => {
  const q = req.query;
  const turno = await disponibles();
  if (q.tipoSesionId) turno.tipoSesionId = id(q.tipoSesionId);
  if (q.modalidad) {
    if (!['PRESENCIAL','VIRTUAL'].includes(q.modalidad)) fallar(400, 'Modalidad inválida.');
    turno.modalidad = q.modalidad;
  }
  if (q.ubicacion) turno.lugar = { is: { OR: [{ nombre: { contains: String(q.ubicacion).slice(0,191) } }, { direccion: { contains: String(q.ubicacion).slice(0,191) } }] } };
  const where = { ...publico, turnos: { some: turno } };
  if (q.nombre) where.AND = String(q.nombre).trim().split(/\s+/).slice(0,10).map(palabra => ({ OR: [{ nombre: { contains: palabra } }, { apellido: { contains: palabra } }] }));
  if (q.obraSocialId) where.obrasSociales = { some: { id: id(q.obraSocialId) } };
  res.json(await prisma.psicologo.findMany({ where, select: { ...nombre, nroMatricula: true, ...seleccionCamposPublicos, obrasSociales: { select: { id: true, nombre: true } }, turnos: { where: turno, select: seleccion, orderBy: [{ fecha: 'asc' }, { horaIni: 'asc' }], take: 100 } }, orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }], take: 100 }).then(rows => rows.map(p => ({ ...p, turnos: p.turnos.map(salida) }))));
});
const disponibilidad = envolver(async (req, res) => {
  res.json((await prisma.turno.findMany({ where: { ...await disponibles(), psicologoId: id(req.params.id), psicologo: publico }, select: seleccion, orderBy: [{ fecha: 'asc' }, { horaIni: 'asc' }], take: 300 })).map(salida));
});
const opcionesPublicas = envolver(async (req, res) => {
  const [obrasSociales, tiposSesion] = await Promise.all([
    prisma.obraSocial.findMany({ where: { psicologos: { some: publico } }, select: { id: true, nombre: true } }),
    prisma.tipoSesion.findMany({ where: { turnos: { some: { ...await disponibles(), psicologo: publico } } }, select: { id: true, nombre: true } }),
  ]);
  res.json({ obrasSociales, tiposSesion });
});
const opcionesProfesional = envolver(async (req, res) => {
  const where = { OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] };
  const [tiposSesion, lugares, obrasSociales, perfil] = await Promise.all([
    prisma.tipoSesion.findMany({ where, select: { id: true, nombre: true } }),
    prisma.lugar.findMany({ where, select: { id: true, nombre: true, direccion: true } }),
    prisma.obraSocial.findMany({ where, select: { id: true, nombre: true } }),
    prisma.psicologo.findUnique({ where: { id: req.usuario.psicologoId }, select: { obrasSociales: { select: { id: true } } } }),
  ]);
  res.json({ tiposSesion, lugares, obrasSociales, obrasSocialesIds: perfil.obrasSociales.map(o => o.id) });
});
const coberturas = envolver(async (req, res) => {
  cuerpo(req.body, ['obrasSocialesIds']);
  if (!Array.isArray(req.body.obrasSocialesIds) || req.body.obrasSocialesIds.length > 100) fallar(400, 'Seleccioná obras sociales válidas.');
  const ids = [...new Set(req.body.obrasSocialesIds.map(id))];
  await serial(async tx => {
    await bloquear(tx, req.usuario.psicologoId);
    const permitidas = await tx.obraSocial.findMany({ where: { id: { in: ids }, OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] } });
    if (permitidas.length !== ids.length) fallar(400, 'Obra social no disponible.');
    await tx.psicologo.update({ where: { id: req.usuario.psicologoId }, data: { obrasSociales: { set: ids.map(id => ({ id })) } } });
  });
  res.json({ mensaje: 'Coberturas actualizadas.' });
});
module.exports = { listar, crear, editar, eliminar, reservar, cancelar, buscar, disponibilidad, opcionesPublicas, opcionesProfesional, coberturas, envolver, id, cuerpo, prisma, serial, fallar, fecha, hora, inicio, validarTurno, sinSuperposicion, salida };



