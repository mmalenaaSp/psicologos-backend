const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/controllers/turnoController');
test('fechas y horas civiles se convierten a Argentina sin depender de la zona del servidor', () => {
  assert.equal(c.inicio({ fecha: c.fecha('2026-12-31'), horaIni: c.hora('23:30') }).toISOString(), '2027-01-01T02:30:00.000Z');
  for (const f of ['2026-02-30', '2026-13-01', '31-12-2026', null]) assert.throws(() => c.fecha(f), { status: 400 });
  for (const h of ['24:00', '12:60', '9:00', null]) assert.throws(() => c.hora(h), { status: 400 });
});
test('validación no admite identidad, estados ni asociaciones arbitrarias', async () => {
  const slot = { fecha: '2099-01-01', horaIni: '10:00', horaFin: '11:00', tipoSesionId: 1, modalidad: 'VIRTUAL', lugarId: null };
  const tx = { tipoSesion: { findFirst: async () => ({ id: 1 }) } };
  for (const extra of [{ psicologoId: 2 }, { pacienteId: 2 }, { estado: 'RESERVADO' }]) await assert.rejects(c.validarTurno(tx, { ...slot, ...extra }, { id: 1 }), { status: 400 });
  await assert.rejects(c.validarTurno(tx, { ...slot, horaFin: '09:00' }, { id: 1 }), { status: 400 });
  await assert.rejects(c.validarTurno(tx, { ...slot, fecha: '2000-01-01' }, { id: 1 }), { status: 409 });
  await assert.rejects(c.validarTurno(tx, { ...slot, modalidad: 'PRESENCIAL' }, { id: 1 }), { status: 400 });
  await assert.rejects(c.validarTurno({ tipoSesion: { findFirst: async () => null } }, slot, { id: 1 }), { status: 400 });
});
test('superposiciones cubren contención, intersección y límites adyacentes', async () => {
  const tx = { turno: { findMany: async () => [{ id: 1, horaIni: c.hora('10:00'), horaFin: c.hora('11:00') }] } };
  const data = (a,b) => ({ fecha: c.fecha('2099-01-01'), horaIni: c.hora(a), horaFin: c.hora(b) });
  for (const [a,b] of [['10:00','11:00'],['09:00','12:00'],['10:15','10:30'],['09:30','10:30'],['10:30','11:30']]) await assert.rejects(c.sinSuperposicion(tx, 1, data(a,b)), { status: 409 });
  await c.sinSuperposicion(tx, 1, data('09:00','10:00'));
  await c.sinSuperposicion(tx, 1, data('11:00','12:00'));
  await c.sinSuperposicion(tx, 1, data('10:00','11:00'), 1);
});
