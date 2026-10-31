const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearServicioPerfilProfesional, validarEdicion, proyectarPublico } = require('../src/services/perfilProfesional');
const usuario = { id: 11, psicologoId: 7, rol: 'PSICOLOGO', perfilCompleto: true };
function memoria(perfilInicial = {}) {
  const perfil = { id: 7, nombre: 'Ana', apellido: 'Prueba', tituloProfesional: 'Título anterior', lugares: [], ...perfilInicial };
  const lugares = [
    { id: 1, nombre: 'Consultorio propio', direccion: 'Dirección pública', propietarioId: 11 },
    { id: 2, nombre: 'Consultorio ajeno', direccion: 'Dirección ajena', propietarioId: 22 },
    { id: 3, nombre: 'Compartido', direccion: 'Dirección compartida', propietarioId: null },
  ];
  const llamadas = [];
  const db = {
    psicologo: {
      async findFirst(options) { llamadas.push(['leer', options]); return perfil; },
      async update(options) {
        llamadas.push(['actualizar', options]);
        const { lugares: relacion, ...datos } = options.data;
        Object.assign(perfil, datos);
        if (relacion) perfil.lugares = lugares.filter(lugar => relacion.set.some(item => item.id === lugar.id));
        return perfil;
      },
    },
    lugar: { async findMany(options) {
      llamadas.push(['lugares', options]);
      return lugares.filter(lugar => lugar.propietarioId === options.where.propietarioId && (!options.where.id || options.where.id.in.includes(lugar.id)));
    } },
    async $transaction(fn, options) { llamadas.push(['transaccion', options]); return fn(db); },
  };
  return { db, perfil, llamadas, servicio: crearServicioPerfilProfesional(db) };
}
test('el perfil público admite edición parcial, limpia texto y permite quitar campos opcionales', () => {
  assert.deepEqual(validarEdicion({ tituloProfesional: '  Licenciada  ', descripcionPublica: ' \n ', fotoUrl: null, aceptaReintegro: false, modalidadPublica: null, lugaresIds: [1, '1'] }), {
    tituloProfesional: 'Licenciada', descripcionPublica: null, fotoUrl: null, aceptaReintegro: false, modalidadPublica: null, lugaresIds: [1],
  });
  assert.deepEqual(validarEdicion({ modalidadPublica: 'AMBAS' }), { modalidadPublica: 'AMBAS' });
  assert.deepEqual(validarEdicion({ fotoUrl: ' https://imagenes.example.test/foto.png ' }), { fotoUrl: 'https://imagenes.example.test/foto.png' });
});
test('la foto sólo admite HTTPS sin credenciales ni esquemas ejecutables', () => {
  for (const fotoUrl of ['http://example.test/foto.png', 'javascript:alert(1)', 'data:image/png;base64,abc', 'https://usuario:clave@example.test/foto', '//example.test/foto', 'https://example.test/\nfalso', 'https://example.test\\foto', 'no-es-url']) {
    assert.throws(() => validarEdicion({ fotoUrl }), { status: 400 });
  }
});
test('el perfil público rechaza identidad, credenciales, asociaciones arbitrarias y cuerpos inválidos', () => {
  for (const body of [null, [], {}, 'texto', { psicologoId: 8 }, { usuarioId: 22 }, { rol: 'PSICOLOGO' }, { direccion: 'Privada' }, { email: 'privado@example.test' }, { lugares: { connect: [{ id: 2 }] } }, { aceptaReintegro: true, nombre: 'Otra persona' }]) {
    assert.throws(() => validarEdicion(body), { status: 400 });
  }
});
test('la validación controla longitudes, booleanos, modalidades y listas de identificadores', () => {
  for (const [campo, limite] of Object.entries({ fotoUrl: 2048, tituloProfesional: 191, enfoqueProfesional: 191, descripcionPublica: 5000, dirigidoA: 500, idiomas: 191 })) {
    assert.throws(() => validarEdicion({ [campo]: 'a'.repeat(limite + 1) }), { status: 400 });
    assert.throws(() => validarEdicion({ [campo]: { texto: 'objeto' } }), { status: 400 });
  }
  for (const body of [{ aceptaReintegro: 'false' }, { aceptaReintegro: 1 }, { aceptaReintegro: null }, { modalidadPublica: 'ONLINE' }, { modalidadPublica: '' }, { idiomas: 'a\u0000b' }, { lugaresIds: '1' }, { lugaresIds: [0] }, { lugaresIds: [1.2] }, { lugaresIds: ['01'] }, { lugaresIds: [2147483648] }, { lugaresIds: Array(101).fill(1) }]) {
    assert.throws(() => validarEdicion(body), { status: 400 });
  }
});
test('la proyección pública elimina datos privados incluso si el almacenamiento entrega campos extra', () => {
  const publico = proyectarPublico({
    id: 7, nombre: 'Ana', apellido: 'Prueba', nroMatricula: 'M-1', tituloProfesional: 'Licenciada',
    email: 'secreto@example.test', telefono: 'privado', direccion: 'domicilio privado', contraseña: 'hash', usuario: { id: 11 }, pacientes: [{ dni: 'secreto' }],
    obrasSociales: [{ id: 3, nombre: 'Cobertura', propietarioId: 11 }],
    lugares: [{ id: 1, nombre: 'Consultorio', direccion: 'Ubicación publicada', propietarioId: 11, turnos: [{ pacienteId: 8 }] }],
  });
  assert.equal(publico.aceptaReintegro, false);
  assert.equal(publico.fotoUrl, null);
  for (const campo of ['email', 'telefono', 'direccion', 'contraseña', 'usuario', 'pacientes']) assert.equal(Object.hasOwn(publico, campo), false);
  assert.deepEqual(publico.obrasSociales, [{ id: 3, nombre: 'Cobertura' }]);
  assert.deepEqual(publico.lugares, [{ id: 1, nombre: 'Consultorio', direccion: 'Ubicación publicada' }]);
});
test('el detalle público exige profesional activo y cuenta activa, sin exigir horarios', async () => {
  const { servicio, llamadas } = memoria();
  const result = await servicio.obtenerPublico('7');
  assert.equal(result.id, 7);
  const consulta = llamadas.find(([tipo]) => tipo === 'leer')[1];
  assert.deepEqual(consulta.where, { id: 7, activo: true, usuario: { is: { estado: 'ACTIVO', rol: 'PSICOLOGO' } } });
  assert.equal(Object.hasOwn(consulta.where, 'turnos'), false);
  for (const campo of ['email', 'telefono', 'direccion', 'contraseña', 'pacientes', 'usuario']) assert.equal(Object.hasOwn(consulta.select, campo), false);
  await assert.rejects(servicio.obtenerPublico('invalido'), { status: 400 });
  const ausente = crearServicioPerfilProfesional({ psicologo: { findFirst: async () => null } });
  await assert.rejects(ausente.obtenerPublico(8), { status: 404 });
});
test('el perfil privado deriva titularidad de la sesión y sólo ofrece lugares propios', async () => {
  const { servicio, llamadas } = memoria({ lugares: [{ id: 1 }] });
  const result = await servicio.obtenerPrivado(usuario);
  assert.deepEqual(result.perfil.lugaresIds, [1]);
  assert.deepEqual(result.lugaresDisponibles, [{ id: 1, nombre: 'Consultorio propio', direccion: 'Dirección pública' }]);
  const consulta = llamadas.find(([tipo]) => tipo === 'leer')[1];
  assert.deepEqual(consulta.where, { id: 7, activo: true, usuario: { is: { id: 11, estado: 'ACTIVO', rol: 'PSICOLOGO' } } });
  assert.equal(Object.hasOwn(result.perfil, 'direccion'), false);
});
test('la edición guarda sólo campos suministrados y publica lugares seleccionados bajo transacción', async () => {
  const { servicio, perfil, llamadas } = memoria();
  const result = await servicio.guardarPrivado(usuario, { descripcionPublica: 'Presentación', lugaresIds: [1], aceptaReintegro: true });
  assert.equal(perfil.tituloProfesional, 'Título anterior');
  assert.equal(result.perfil.descripcionPublica, 'Presentación');
  assert.deepEqual(result.perfil.lugaresIds, [1]);
  const actualizacion = llamadas.find(([tipo]) => tipo === 'actualizar')[1];
  assert.deepEqual(actualizacion.where.usuario.is, { id: 11, estado: 'ACTIVO', rol: 'PSICOLOGO' });
  assert.deepEqual(actualizacion.data, { descripcionPublica: 'Presentación', aceptaReintegro: true, lugares: { set: [{ id: 1 }] } });
  assert.deepEqual(llamadas.find(([tipo]) => tipo === 'transaccion')[1], { isolationLevel: 'Serializable' });
  const quitado = await servicio.guardarPrivado(usuario, { lugaresIds: [] });
  assert.deepEqual(quitado.perfil.lugaresIds, []);
});
test('no se publican lugares ajenos ni compartidos y un rechazo no escribe campos', async () => {
  for (const lugarId of [2, 3, 99]) {
    const { servicio, llamadas } = memoria();
    await assert.rejects(servicio.guardarPrivado(usuario, { tituloProfesional: 'Intento', lugaresIds: [lugarId] }), { status: 400 });
    assert.equal(llamadas.some(([tipo]) => tipo === 'actualizar'), false);
  }
});
test('pacientes y perfiles incompletos no acceden al servicio privado', async () => {
  const { servicio, llamadas } = memoria();
  for (const actor of [null, { ...usuario, rol: 'PACIENTE' }, { ...usuario, perfilCompleto: false }, { ...usuario, psicologoId: null }]) {
    await assert.rejects(servicio.obtenerPrivado(actor), { status: 403 });
    await assert.rejects(servicio.guardarPrivado(actor, { idiomas: 'Español' }), { status: 403 });
  }
  assert.equal(llamadas.length, 0);
});
