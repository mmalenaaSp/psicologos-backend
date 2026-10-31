const { test } = require('node:test');
const assert = require('node:assert/strict');
const { activarCuenta } = require('../scripts/activar-cuenta');
test('el comando anterior no permite apropiarse de una ficha por identificador', async () => {
  const prisma = new Proxy({}, { get() { throw new Error('No debe consultar la base'); } });
  await assert.rejects(activarCuenta(prisma, 'prueba@example.test', 'PACIENTE', 1), /retirada/);
});
