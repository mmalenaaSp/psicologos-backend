'use strict';

// Opt-in only. Creates and keeps a NEW local database with synthetic data.
// Does not read tables from the configured database and never drops databases.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const projectRoot = path.resolve(__dirname, '..');
let redact = value => String(value);
let testDatabaseName;
let checks = 0;
function verify(condition, message) { assert.ok(condition, message); checks++; }

async function main() {
  if (process.env.RUN_ISOLATED_MYSQL_TEST !== '1') {
    throw new Error('Prueba deshabilitada. Usar RUN_ISOLATED_MYSQL_TEST=1 para crear una base local nueva y aislada.');
  }
  require('dotenv').config({ path: path.join(projectRoot, '.env'), quiet: true });
  const originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error('Falta DATABASE_URL local. No se modifico ninguna base.');
  let parsed;
  try { parsed = new URL(originalUrl); }
  catch { throw new Error('DATABASE_URL no tiene formato valido. No se modifico ninguna base.'); }
  if (parsed.protocol !== 'mysql:' || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('La prueba solo admite MySQL en localhost, 127.0.0.1 o ::1. No se modifico ninguna base.');
  }
  const suffix = crypto.randomBytes(8).toString('hex');
  testDatabaseName = 'psycogest_codex_test_' + Date.now().toString(36) + '_' + suffix;
  verify(/^psycogest_codex_test_[a-z0-9_]+$/.test(testDatabaseName), 'Nombre de base de prueba invalido.');
  const testUrl = new URL(parsed);
  testUrl.pathname = '/' + testDatabaseName;
  const adminUrl = new URL(parsed);
  adminUrl.pathname = '/information_schema';
  const privateValues = [originalUrl, testUrl.toString(), adminUrl.toString()];
  for (const value of [parsed.username, parsed.password]) {
    if (value) {
      privateValues.push(value);
      try { privateValues.push(decodeURIComponent(value)); } catch { /* Already encoded. */ }
    }
  }
  redact = value => {
    let result = String(value);
    for (const secret of [...new Set(privateValues)].sort((a, b) => b.length - a.length)) {
      if (secret) result = result.split(secret).join('[redactado]');
    }
    return result.replace(/mysql:\/\/[^\s'"]+/gi, '[DATABASE_URL redactada]');
  };
  const { PrismaClient } = require('@prisma/client');
  let admin;
  let prisma;
  let server;
  const fixturePassword = 'Solo-Pruebas-2026!' + suffix;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFrontend = process.env.FRONTEND_URL;
  try {
    // Only metadata connection; its only explicit statement creates a fresh database.
    admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
    const quote = String.fromCharCode(96);
    await admin.$executeRawUnsafe(
      'CREATE DATABASE ' + quote + testDatabaseName + quote + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    console.log('Base aislada creada: ' + testDatabaseName);
    await admin.$disconnect();
    admin = null;
    const migrationArgs = ['--no-install', 'prisma', 'migrate', 'deploy'];
    const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npx';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx ' + migrationArgs.join(' ')] : migrationArgs;
    const migration = spawnSync(command, args, {
      cwd: projectRoot, env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    if (migration.error || migration.status !== 0) {
      const detail = [migration.error?.message, migration.stdout, migration.stderr].filter(Boolean).join('\n');
      throw new Error('No se pudieron aplicar migraciones en la base aislada.\n' + redact(detail));
    }
    console.log('npx prisma migrate deploy: OK (solo base aislada).');
    process.env.DATABASE_URL = testUrl.toString();
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    prisma = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
    const app = require('../src/index');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = 'http://127.0.0.1:' + server.address().port;

    async function request(route, { method = 'GET', cookie, body } = {}) {
      const headers = { Origin: process.env.FRONTEND_URL };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(baseUrl + route, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      let payload;
      try { payload = raw ? JSON.parse(raw) : null; }
      catch { throw new Error('Respuesta no JSON en ' + route + ' (HTTP ' + response.status + ').'); }
      const serialized = JSON.stringify(payload);
      verify(!['passwordHash', 'contrase' + '\u00f1' + 'a', 'tokenHash'].some(key => serialized.includes(key)),
        'Una respuesta incluyo campos sensibles.');
      return { status: response.status, body: payload, headers: response.headers };
    }
    function status(response, expected, label) {
      verify(response.status === expected, label + ': HTTP esperado ' + expected + ', recibido ' + response.status + '.');
      return response;
    }
    function cookieFrom(response) {
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      verify(Boolean(cookie?.startsWith('pg_sesion=')), 'No se recibio cookie de sesion.');
      return cookie;
    }
    async function newAccount(tag, rol) {
      const email = tag + '-' + suffix + '@example.test';
      status(await request('/api/auth/register', { method: 'POST', body: { email, password: fixturePassword, rol } }), 201, 'Registro ' + rol);
      const login = status(await request('/api/auth/login', { method: 'POST', body: { email, password: fixturePassword } }), 200, 'Login sin perfil ' + rol);
      verify(login.body.usuario.perfilCompleto === false, 'Una cuenta nueva obtuvo perfil completo.');
      const cookie = cookieFrom(login);
      status(await request('/api/pacientes', { cookie }), 403, 'Cuenta sin perfil no lista pacientes');
      return { cookie, email, id: login.body.usuario.id };
    }
    const professionalData = tag => ({
      nombre: 'Profesional ' + tag, apellido: 'Ficticio', telefono: 'TEST',
      direccion: 'Direccion ficticia de prueba', nroMatricula: 'MAT-' + tag + '-' + suffix,
      colegio: { nombre: 'Colegio ficticio ' + tag, distrito: 'TEST', direccion: 'Direccion ficticia' },
    });
    const patient = await newAccount('paciente', 'PACIENTE');
    const professional = await newAccount('profesional', 'PSICOLOGO');
    status(await request('/api/mi-perfil/profesional', { cookie: professional.cookie }), 403, 'Perfil incompleto no consulta perfil profesional');
    status(await request('/api/mi-perfil/profesional', { method: 'PATCH', cookie: professional.cookie, body: { tituloProfesional: 'No publicado' } }), 403, 'Perfil incompleto no publica perfil profesional');
    const patientProfile = status(await request('/api/mi-perfil', {
      method: 'PUT', cookie: patient.cookie, body: {
        nombre: 'Paciente', apellido: 'Ficticio', telefono: 'TEST', dni: 'SELF-' + suffix,
        fechaNacimiento: '2000-01-01', obraSocialId: null,
      },
    }), 200, 'Completar perfil paciente');
    verify(patientProfile.body.usuario.perfilCompleto, 'El perfil paciente no habilito su portal.');
    const professionalProfile = status(await request('/api/mi-perfil', {
      method: 'PUT', cookie: professional.cookie, body: professionalData('A'),
    }), 200, 'Completar perfil profesional');
    verify(professionalProfile.body.usuario.perfilCompleto, 'El perfil profesional no habilito su espacio.');
    const ownPatient = status(await request('/api/mi-perfil?id=999999&pacienteId=999999', { cookie: patient.cookie }), 200, 'Perfil paciente propio');
    verify(ownPatient.body.perfil.id === patientProfile.body.perfil.id, 'El portal paciente devolvio otro perfil.');
    status(await request('/api/pacientes', { cookie: patient.cookie }), 403, 'Paciente no accede a CRUD profesional');
    status(await request('/api/mi-perfil', {
      method: 'PUT', cookie: patient.cookie, body: { ...patientProfile.body.perfil, pacienteId: 999999 },
    }), 400, 'Paciente no inyecta vinculos');
    const clinicalPatient = status(await request('/api/pacientes', {
      method: 'POST', cookie: professional.cookie, body: {
        nombre: 'Ficha', apellido: 'Ficticia', telefono: 'TEST', dni: 'CLINICAL-' + suffix,
        fechaNacimiento: '2001-01-01', obraSocialId: null,
      },
    }), 201, 'Crear paciente propio');
    const place = status(await request('/api/lugares', {
      method: 'POST', cookie: professional.cookie, body: { nombre: 'Lugar ficticio', direccion: 'Direccion ficticia' },
    }), 201, 'Crear lugar propio');
    const sessionType = status(await request('/api/tipos-sesion', {
      method: 'POST', cookie: professional.cookie, body: { nombre: 'Sesion ficticia', precioBase: 123.45 },
    }), 201, 'Crear tipo propio');
    const legacy = await prisma.paciente.create({ data: {
      nombre: 'Ficha anterior', apellido: 'Ficticia', telefono: 'TEST', dni: 'LEGACY-' + suffix,
      fechaNacimiento: new Date('2000-01-01T00:00:00.000Z'), propietarioId: null,
    } });
    status(await request('/api/pacientes/' + clinicalPatient.body.id, { cookie: professional.cookie }), 200, 'Leer paciente propio');
    status(await request('/api/pacientes/' + legacy.id, { cookie: professional.cookie }), 404, 'Ocultar ficha anterior');
    const secondProfessional = await newAccount('segundo', 'PSICOLOGO');
    const concurrentProfiles = await Promise.all([1, 2].map(() => request('/api/mi-perfil', {
      method: 'PUT', cookie: secondProfessional.cookie, body: professionalData('B'),
    })));
    verify(concurrentProfiles.some(response => response.status === 200), 'Ningun completado concurrente finalizo.');
    verify(concurrentProfiles.every(response => [200, 409].includes(response.status)), 'Respuesta inesperada en concurrencia.');
    verify(await prisma.psicologo.count({ where: { email: secondProfessional.email } }) === 1, 'La concurrencia creo perfiles duplicados.');
    const secondOwn = status(await request('/api/mi-perfil', { cookie: secondProfessional.cookie }), 200, 'Segundo perfil propio');
    verify(secondOwn.body.usuario.perfilCompleto, 'El segundo perfil quedo incompleto.');
    // Perfil profesional: persistencia, titularidad y proyeccion publica real.
    const publicProfileRoute = '/api/mi-perfil/profesional';
    const publicDetailRoute = '/api/profesionales/' + professionalProfile.body.perfil.id;
    const privateSelection = { nombre: true, apellido: true, telefono: true, direccion: true, email: true, nroMatricula: true, colegioId: true, activo: true };
    const accountSelection = { email: true, passwordHash: true, rol: true, estado: true, psicologoId: true, pacienteId: true };
    const privateBefore = await prisma.psicologo.findUnique({ where: { id: professionalProfile.body.perfil.id }, select: privateSelection });
    const accountBefore = await prisma.usuario.findUnique({ where: { id: professional.id }, select: accountSelection });
    const initialPublicProfile = status(await request(publicProfileRoute, { cookie: professional.cookie }), 200, 'Leer perfil profesional propio inicial').body;
    const publicTextFields = ['fotoUrl', 'tituloProfesional', 'enfoqueProfesional', 'descripcionPublica', 'dirigidoA', 'idiomas', 'modalidadPublica'];
    verify(publicTextFields.every(field => initialPublicProfile.perfil[field] === null) && initialPublicProfile.perfil.aceptaReintegro === false, 'Los perfiles anteriores no conservan los valores publicos opcionales iniciales.');
    verify(Array.isArray(initialPublicProfile.perfil.lugaresIds) && initialPublicProfile.perfil.lugaresIds.length === 0, 'Un perfil nuevo publica lugares sin seleccion explicita.');
    status(await request(publicProfileRoute), 401, 'Anonimo no lee editor profesional');
    status(await request(publicProfileRoute, { method: 'PATCH', body: { tituloProfesional: 'Intento' } }), 401, 'Anonimo no edita perfil profesional');
    status(await request(publicProfileRoute, { cookie: patient.cookie }), 403, 'Paciente no lee editor profesional');
    status(await request(publicProfileRoute, { method: 'PATCH', cookie: patient.cookie, body: { tituloProfesional: 'Intento' } }), 403, 'Paciente no edita perfil profesional');
    const foreignPlace = status(await request('/api/lugares', {
      method: 'POST', cookie: secondProfessional.cookie, body: { nombre: 'Consultorio ajeno ficticio', direccion: 'Direccion ajena ficticia' },
    }), 201, 'Crear consultorio ajeno ficticio').body;
    const sharedPlace = await prisma.lugar.create({ data: { nombre: 'Lugar compartido no publicado', direccion: 'Direccion compartida ficticia', propietarioId: null } });
    const publicProfileData = {
      fotoUrl: 'https://images.example.test/perfil-ficticio.png',
      tituloProfesional: 'Licenciada en Psicologia', enfoqueProfesional: 'Enfoque integrativo',
      descripcionPublica: 'Presentacion profesional ficticia para comprobar persistencia y privacidad.',
      dirigidoA: 'Personas adultas', idiomas: 'Espanol, portugues', modalidadPublica: 'AMBAS',
      aceptaReintegro: true, lugaresIds: [place.body.id],
    };
    const savedPublicProfile = status(await request(publicProfileRoute, {
      method: 'PATCH', cookie: professional.cookie, body: publicProfileData,
    }), 200, 'Guardar perfil profesional propio').body;
    verify(publicTextFields.every(field => savedPublicProfile.perfil[field] === publicProfileData[field]) && savedPublicProfile.perfil.aceptaReintegro === true, 'El editor no devuelve los campos guardados.');
    verify(JSON.stringify(savedPublicProfile.perfil.lugaresIds) === JSON.stringify([place.body.id]), 'No guarda los lugares seleccionados.');
    verify(savedPublicProfile.lugaresDisponibles.some(row => row.id === place.body.id)
      && !savedPublicProfile.lugaresDisponibles.some(row => [foreignPlace.id, sharedPlace.id].includes(row.id)), 'El editor ofrece lugares ajenos o compartidos.');
    const reloadedPublicProfile = status(await request(publicProfileRoute, { cookie: professional.cookie }), 200, 'Recargar perfil profesional persistido').body;
    verify(publicTextFields.every(field => reloadedPublicProfile.perfil[field] === publicProfileData[field]) && reloadedPublicProfile.perfil.aceptaReintegro === true, 'Los campos publicos no persisten en MySQL.');
    const invalidPublicBodies = [
      { id: secondOwn.body.perfil.id }, { psicologoId: secondOwn.body.perfil.id }, { usuarioId: secondProfessional.id },
      { rol: 'PACIENTE' }, { telefono: 'No modificar privado' }, { usuario: { rol: 'PSICOLOGO' } },
      { lugares: { connect: { id: foreignPlace.id } } }, { tituloProfesional: { set: 'No permitido' } },
      { tituloProfesional: 123 }, { aceptaReintegro: 'false' }, { aceptaReintegro: null },
      { fotoUrl: 'javascript:alert(1)' }, { fotoUrl: 'data:image/svg+xml,ficticio' },
      { fotoUrl: 'http://images.example.test/insegura.png' }, { fotoUrl: '//images.example.test/insegura.png' },
      { fotoUrl: 'https://usuario:clave@images.example.test/perfil.png' }, { fotoUrl: 'no-es-una-url' },
      { modalidadPublica: 'SIN_VALIDAR' }, { lugaresIds: [foreignPlace.id] }, { lugaresIds: [sharedPlace.id] },
      { lugaresIds: [2147483647] }, { lugaresIds: [-1] }, { lugaresIds: [{ id: place.body.id }] },
      { lugaresIds: String(place.body.id) },
      ...Object.entries({ tituloProfesional: 191, enfoqueProfesional: 191, descripcionPublica: 5000, dirigidoA: 500, idiomas: 191 })
        .map(([field, maximum]) => ({ [field]: 'x'.repeat(maximum + 1) })),
      { fotoUrl: 'https://images.example.test/' + 'x'.repeat(2048) },
    ];
    for (let index = 0; index < invalidPublicBodies.length; index++) {
      status(await request(publicProfileRoute, { method: 'PATCH', cookie: professional.cookie, body: invalidPublicBodies[index] }), 400, 'Rechazar datos publicos invalidos ' + (index + 1));
    }
    const afterInvalidPublicProfile = status(await request(publicProfileRoute, { cookie: professional.cookie }), 200, 'Validacion no altera datos previos').body;
    verify(publicTextFields.every(field => afterInvalidPublicProfile.perfil[field] === publicProfileData[field])
      && afterInvalidPublicProfile.perfil.aceptaReintegro === true
      && JSON.stringify(afterInvalidPublicProfile.perfil.lugaresIds) === JSON.stringify(publicProfileData.lugaresIds), 'Una solicitud rechazada altero el perfil publicado.');
    const maximumPublicText = Object.fromEntries(Object.entries({ tituloProfesional: 191, enfoqueProfesional: 191, descripcionPublica: 5000, dirigidoA: 500, idiomas: 191 }).map(([field, maximum]) => [field, 'x'.repeat(maximum)]));
    const maximumSaved = status(await request(publicProfileRoute, { method: 'PATCH', cookie: professional.cookie, body: maximumPublicText }), 200, 'Guardar longitudes maximas permitidas').body;
    verify(Object.entries(maximumPublicText).every(([field, value]) => maximumSaved.perfil[field] === value), 'MySQL no conserva los textos de longitudes permitidas.');
    const clearedPublicProfile = status(await request(publicProfileRoute, {
      method: 'PATCH', cookie: professional.cookie, body: { fotoUrl: null, dirigidoA: '  ', modalidadPublica: null, aceptaReintegro: false, lugaresIds: [] },
    }), 200, 'Vaciar campos publicos opcionales').body;
    verify(clearedPublicProfile.perfil.fotoUrl === null && clearedPublicProfile.perfil.dirigidoA === null
      && clearedPublicProfile.perfil.modalidadPublica === null && clearedPublicProfile.perfil.aceptaReintegro === false
      && clearedPublicProfile.perfil.lugaresIds.length === 0, 'No permite borrar foto, texto opcional, modalidad o lugares publicados.');
    status(await request(publicProfileRoute, { method: 'PATCH', cookie: professional.cookie, body: publicProfileData }), 200, 'Restaurar presentacion ficticia');
    const ownProfileWithForeignQuery = status(await request(publicProfileRoute + '?psicologoId=' + professionalProfile.body.perfil.id + '&usuarioId=' + professional.id, { cookie: secondProfessional.cookie }), 200, 'Query ajena no cambia identidad de lectura').body;
    verify(ownProfileWithForeignQuery.perfil.tituloProfesional === null && ownProfileWithForeignQuery.perfil.lugaresIds.length === 0, 'Un profesional leyo el editor privado de otro mediante query.');
    status(await request(publicProfileRoute + '?psicologoId=' + professionalProfile.body.perfil.id + '&usuarioId=' + professional.id, {
      method: 'PATCH', cookie: secondProfessional.cookie, body: { tituloProfesional: 'Titulo propio del segundo profesional' },
    }), 200, 'Query ajena no cambia identidad de escritura');
    const unchangedOwner = status(await request(publicProfileRoute, { cookie: professional.cookie }), 200, 'Primer perfil conserva titularidad').body;
    verify(unchangedOwner.perfil.tituloProfesional === publicProfileData.tituloProfesional, 'Otro profesional modifico el perfil ajeno mediante query.');
    const changedSecondOwner = status(await request(publicProfileRoute, { cookie: secondProfessional.cookie }), 200, 'Segundo perfil actualiza solo datos propios').body;
    verify(changedSecondOwner.perfil.tituloProfesional === 'Titulo propio del segundo profesional', 'El editor no deriva el perfil de la sesion.');
    const privateAfter = await prisma.psicologo.findUnique({ where: { id: professionalProfile.body.perfil.id }, select: privateSelection });
    const accountAfter = await prisma.usuario.findUnique({ where: { id: professional.id }, select: accountSelection });
    verify(JSON.stringify(privateBefore) === JSON.stringify(privateAfter) && JSON.stringify(accountBefore) === JSON.stringify(accountAfter), 'Editar el perfil publico modifico datos privados, credenciales o vinculos de la cuenta.');
    const publicProfileLogin = status(await request('/api/auth/login', { method: 'POST', body: { email: professional.email, password: fixturePassword } }), 200, 'Login conserva credenciales despues de editar perfil publico');
    verify(publicProfileLogin.body.usuario.id === professional.id && publicProfileLogin.body.usuario.perfilCompleto, 'Editar presentacion cambio la identidad o el estado del onboarding.');
    status(await request('/api/auth/logout', { method: 'POST', cookie: cookieFrom(publicProfileLogin), body: {} }), 200, 'Cerrar solo la sesion adicional de comprobacion');
    function safePublicProfile(payload, label) {
      const forbiddenKeys = new Set(['telefono', 'email', 'propietarioId', 'usuario', 'usuarios', 'paciente', 'pacientes', 'pacienteId', 'passwordHash', 'tokenHash', 'contrase' + '\u00f1' + 'a', 'sesiones']);
      const visit = value => value === null || typeof value !== 'object'
        || Object.entries(value).every(([key, child]) => !forbiddenKeys.has(key) && visit(child));
      const profiles = Array.isArray(payload) ? payload : [payload];
      const serialized = JSON.stringify(payload);
      verify(visit(payload) && profiles.every(row => !Object.hasOwn(row, 'direccion'))
        && ![professional.email, secondProfessional.email, privateBefore.direccion].some(value => serialized.includes(value)), label + ': la proyeccion publica contiene datos privados.');
    }
    const profileWithoutSlots = status(await request(publicDetailRoute), 200, 'Detalle publico sin sesion y sin disponibilidad').body;
    safePublicProfile(profileWithoutSlots, 'Detalle sin disponibilidad');
    verify(profileWithoutSlots.id === professionalProfile.body.perfil.id && profileWithoutSlots.nombre === privateBefore.nombre
      && publicTextFields.every(field => profileWithoutSlots[field] === publicProfileData[field]) && profileWithoutSlots.aceptaReintegro === true, 'El detalle publico no devuelve la presentacion propia guardada.');
    verify(profileWithoutSlots.lugares.length === 1 && profileWithoutSlots.lugares[0].id === place.body.id
      && profileWithoutSlots.lugares[0].direccion === place.body.direccion, 'El detalle no publica exclusivamente los consultorios seleccionados.');
    verify(Array.isArray(profileWithoutSlots.obrasSociales) && profileWithoutSlots.obrasSociales.length === 0, 'Se inventaron coberturas publicas.');
    status(await request('/api/profesionales/2147483647'), 404, 'Profesional inexistente sin detalle publico');
    await prisma.psicologo.update({ where: { id: professionalProfile.body.perfil.id }, data: { activo: false } });
    status(await request(publicDetailRoute), 404, 'Profesional inactivo sin detalle publico');
    await prisma.psicologo.update({ where: { id: professionalProfile.body.perfil.id }, data: { activo: true } });
    await prisma.usuario.update({ where: { id: professional.id }, data: { estado: 'BLOQUEADO' } });
    status(await request(publicDetailRoute), 404, 'Cuenta bloqueada sin detalle publico');
    await prisma.usuario.update({ where: { id: professional.id }, data: { estado: 'ACTIVO' } });
    for (const [endpoint, id, updateBody] of [
      ['pacientes', clinicalPatient.body.id, { nombre: 'Intento bloqueado' }],
      ['lugares', place.body.id, { nombre: 'Intento bloqueado', direccion: 'Ficticia' }],
      ['tipos-sesion', sessionType.body.id, { nombre: 'Intento bloqueado', precioBase: 999 }],
      ['psicologos', professionalProfile.body.perfil.id, { nombre: 'Intento bloqueado' }],
    ]) {
      const route = '/api/' + endpoint + '/' + id;
      status(await request(route, { cookie: secondProfessional.cookie }), 404, 'Rechazar lectura ajena ' + endpoint);
      status(await request(route, { method: 'PUT', cookie: secondProfessional.cookie, body: updateBody }), 404, 'Rechazar escritura ajena ' + endpoint);
      status(await request(route, { method: 'DELETE', cookie: secondProfessional.cookie }), 404, 'Rechazar borrado ajeno ' + endpoint);
      if (endpoint !== 'psicologos') {
        const list = status(await request('/api/' + endpoint, { cookie: secondProfessional.cookie }), 200, 'Listar solo propios ' + endpoint);
        const expectedIds = endpoint === 'lugares' ? [foreignPlace.id] : [];
        verify(Array.isArray(list.body) && list.body.length === expectedIds.length
          && list.body.every(row => expectedIds.includes(row.id)), 'El listado de ' + endpoint + ' no coincide con los registros propios esperados.');
      }
    }
    status(await request('/api/pacientes/' + legacy.id, { cookie: secondProfessional.cookie }), 404, 'Segundo profesional sin legado');
    // Flujo de turnos real contra MySQL, exclusivamente con datos ficticios.
    const otherPatient = await newAccount('otro-paciente', 'PACIENTE');
    status(await request('/api/mi-perfil', { method: 'PUT', cookie: otherPatient.cookie, body: {
      nombre: 'Otro', apellido: 'Ficticio', telefono: 'TEST', dni: 'OTHER-' + suffix,
      fechaNacimiento: '2000-01-01', obraSocialId: null,
    } }), 200, 'Segundo paciente');
    const coverage = await prisma.obraSocial.create({ data: { codigo: 'OS-' + suffix, nombre: 'Cobertura ficticia', propietarioId: professional.id } });
    status(await request('/api/turnos/coberturas', { method: 'PUT', cookie: professional.cookie, body: { obrasSocialesIds: [coverage.id] } }), 200, 'Configurar cobertura');
    const patientOptions = status(await request('/api/mi-perfil/opciones', { cookie: patient.cookie }), 200, 'Paciente consulta coberturas publicadas').body;
    verify(patientOptions.obrasSociales.some(o => o.id === coverage.id), 'La cobertura publicada no está disponible para el paciente.');
    status(await request('/api/mi-perfil', { method: 'PUT', cookie: patient.cookie, body: {
      nombre: 'Paciente', apellido: 'Ficticio', telefono: 'TEST', dni: 'SELF-' + suffix,
      fechaNacimiento: '2000-01-01', obraSocialId: coverage.id,
    } }), 200, 'Paciente elige cobertura publicada');
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10);
    const slotData = { fecha: tomorrow, horaIni: '10:00', horaFin: '11:00', tipoSesionId: sessionType.body.id, modalidad: 'PRESENCIAL', lugarId: place.body.id };
    const slot = status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: slotData }), 201, '1 Crear horario').body;
    verify(slot.inicio === tomorrow + 'T13:00:00.000Z', 'Zona horaria Argentina incorrecta.');
    status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: { ...slotData, psicologoId: secondOwn.body.perfil.id } }), 400, 'Rechazar psicologoId arbitrario');
    status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: { ...slotData, fecha: '2020-01-01' } }), 409, 'Rechazar pasado');
    status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: { ...slotData, horaFin: '09:00' } }), 400, 'Rechazar intervalo inválido');
    status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: slotData }), 409, 'Rechazar superposición');
    const matches = status(await request('/api/profesionales?' + new URLSearchParams({ nombre: 'Profesional A Ficticio', obraSocialId: coverage.id, tipoSesionId: sessionType.body.id, modalidad: 'PRESENCIAL', ubicacion: 'Direccion ficticia' })), 200, '2 Buscar con filtros').body;
    verify(matches.length === 1 && matches[0].id === professionalProfile.body.perfil.id, 'Filtros no encuentran al profesional esperado.');
    safePublicProfile(matches, 'Listado publico con disponibilidad');
    verify(publicTextFields.every(field => matches[0][field] === publicProfileData[field]) && matches[0].aceptaReintegro === true, 'El listado publico no incluye la presentacion y modalidad guardadas.');
    const publishedDetail = status(await request(publicDetailRoute), 200, 'Detalle con coberturas y agenda publicada').body;
    safePublicProfile(publishedDetail, 'Detalle publico con cobertura');
    verify(publishedDetail.obrasSociales.some(row => row.id === coverage.id && row.nombre === coverage.nombre)
      && publishedDetail.lugares.some(row => row.id === place.body.id), 'El detalle publico no refleja coberturas y lugares reales.');
    const wrong = status(await request('/api/profesionales?modalidad=VIRTUAL'), 200, 'Filtro sin resultados').body;
    verify(!wrong.some(p => p.id === professionalProfile.body.perfil.id), 'Modalidad no filtra datos reales.');
    const publicSlots = status(await request('/api/profesionales/' + professionalProfile.body.perfil.id + '/disponibilidad'), 200, '3 Disponibilidad pública').body;
    verify(publicSlots.some(t => t.id === slot.id), 'El horario no aparece disponible.');
    verify(!JSON.stringify(publicSlots).includes('pacienteId') && !JSON.stringify(matches).includes('contraseña') && !JSON.stringify(matches).includes('telefono'), 'Datos privados en respuesta pública.');
    status(await request('/api/turnos/' + slot.id + '/reservar', { method: 'POST', cookie: patient.cookie, body: { pacienteId: otherPatient.id } }), 400, 'Rechazar pacienteId arbitrario');
    status(await request('/api/turnos/' + slot.id + '/reservar', { method: 'POST', cookie: patient.cookie, body: {} }), 200, '4 Reservar');
    for (const cookie of [professional.cookie, patient.cookie]) {
      const rows = status(await request('/api/turnos', { cookie }), 200, '5 Turnos en ambos portales').body;
      verify(rows.some(t => t.id === slot.id && t.estado === 'RESERVADO'), 'Reserva ausente en portal.');
    }
    status(await request('/api/turnos/' + slot.id + '/reservar', { method: 'POST', cookie: otherPatient.cookie, body: {} }), 409, '6 Impedir doble reserva');
    status(await request('/api/turnos/' + slot.id, { method: 'DELETE', cookie: professional.cookie }), 409, 'No borrar reservado');
    status(await request('/api/turnos/' + slot.id + '/cancelar', { method: 'POST', cookie: otherPatient.cookie, body: {} }), 404, '9 No cancelar reservas ajenas');
    const others = status(await request('/api/turnos', { cookie: otherPatient.cookie }), 200, '9 No consultar reservas ajenas').body;
    verify(!others.some(t => t.id === slot.id), 'Un paciente ve reservas ajenas.');
    status(await request('/api/turnos/' + slot.id, { method: 'PUT', cookie: secondProfessional.cookie, body: slotData }), 404, '10 No modificar turnos ajenos');
    status(await request('/api/turnos/' + slot.id, { method: 'DELETE', cookie: secondProfessional.cookie }), 404, '10 No borrar turnos ajenos');
    status(await request('/api/turnos/' + slot.id + '/cancelar', { method: 'POST', cookie: patient.cookie, body: {} }), 200, '7 Cancelar reserva propia');
    const freed = status(await request('/api/profesionales/' + professionalProfile.body.perfil.id + '/disponibilidad'), 200, '8 Horario vuelve a disponible').body;
    verify(freed.some(t => t.id === slot.id && t.estado === 'DISPONIBLE'), 'El horario no fue liberado.');
    const concurrent = await Promise.all([patient, otherPatient].map(p => request('/api/turnos/' + slot.id + '/reservar', { method: 'POST', cookie: p.cookie, body: {} })));
    verify(concurrent.filter(r => r.status === 200).length === 1 && concurrent.filter(r => r.status === 409).length === 1, 'La reserva simultánea no tiene exactamente un ganador.');
    const winner = concurrent[0].status === 200 ? patient : otherPatient;
    status(await request('/api/turnos/' + slot.id + '/cancelar', { method: 'POST', cookie: winner.cookie, body: {} }), 200, 'Liberar para liquidación');
    status(await request('/api/turnos/' + slot.id + '/reservar', { method: 'POST', cookie: patient.cookie, body: {} }), 200, 'Reserva para liquidar');
    const publicDetailAfterReservation = status(await request(publicDetailRoute), 200, 'Detalle publico despues de reservar').body;
    safePublicProfile(publicDetailAfterReservation, 'Detalle despues de reservar');
    const publicListAfterReservation = status(await request('/api/profesionales'), 200, 'Listado publico despues de reservar').body;
    safePublicProfile(publicListAfterReservation, 'Listado despues de reservar');
    const billBody = { obraSocialId: coverage.id, detalles: [{ turnoId: slot.id, importe: '123.45' }] };
    const bill = status(await request('/api/liquidaciones', { method: 'POST', cookie: professional.cookie, body: billBody }), 201, 'Emitir liquidación').body;
    verify(bill.valorTotal === '123.45' && bill.detalles[0].importe === '123.45', 'Importe explícito incorrecto.');
    status(await request('/api/liquidaciones', { method: 'POST', cookie: professional.cookie, body: billBody }), 409, 'No liquidar dos veces');
    status(await request('/api/liquidaciones', { cookie: patient.cookie }), 403, 'Paciente no ve liquidaciones');
    const foreignBills = status(await request('/api/liquidaciones', { cookie: secondProfessional.cookie }), 200, 'Liquidaciones propias').body;
    verify(foreignBills.length === 0, 'Otro profesional ve liquidaciones ajenas.');
    status(await request('/api/liquidaciones/' + bill.id + '/pagar', { method: 'PATCH', cookie: secondProfessional.cookie, body: {} }), 404, 'No pagar liquidación ajena');
    status(await request('/api/liquidaciones/' + bill.id + '/pagar', { method: 'PATCH', cookie: professional.cookie, body: {} }), 200, 'Registrar pago');
    const paid = status(await request('/api/liquidaciones?estado=PAGADA&obraSocialId=' + coverage.id, { cookie: professional.cookie }), 200, 'Filtrar liquidaciones').body;
    verify(paid.length === 1 && paid[0].valorTotal === '123.45', 'No conserva histórico de importes.');
    // Edición, eliminación de libres y cancelación profesional.
    const freeData = { ...slotData, horaIni: '12:00', horaFin: '13:00' };
    const free = status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: freeData }), 201, 'Crear libre para editar').body;
    status(await request('/api/turnos/' + free.id, { method: 'PUT', cookie: professional.cookie, body: { ...freeData, horaFin: '13:30' } }), 200, 'Editar horario libre');
    status(await request('/api/turnos/' + free.id, { method: 'DELETE', cookie: professional.cookie }), 204, 'Eliminar horario libre');
    status(await request('/api/turnos/' + slot.id + '/cancelar', { method: 'POST', cookie: professional.cookie, body: {} }), 200, 'Cancelar profesional conserva paciente e historial');
    const canceled = status(await request('/api/turnos', { cookie: patient.cookie }), 200, 'Paciente ve cancelación profesional').body;
    verify(canceled.some(t => t.id === slot.id && t.estado === 'CANCELADO'), 'No conserva turno cancelado del paciente.');
    const parallelData = { ...slotData, horaIni: '15:00', horaFin: '16:00' };
    const parallelCreation = await Promise.all([1,2].map(() => request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: parallelData })));
    verify(parallelCreation.filter(r => r.status === 201).length === 1 && parallelCreation.filter(r => r.status === 409).length === 1, 'Creación simultánea produjo horarios superpuestos.');
    status(await request('/api/turnos', { method: 'POST', cookie: professional.cookie, body: { ...parallelData, horaIni: '16:00', horaFin: '17:00' } }), 201, 'Permitir horarios adyacentes');
    const pastSlot = await prisma.turno.create({ data: {
      fecha: new Date('2020-01-01T00:00:00Z'), horaIni: new Date('1970-01-01T10:00:00Z'), horaFin: new Date('1970-01-01T11:00:00Z'),
      estado: 'RESERVADO', modalidad: 'VIRTUAL', psicologoId: professionalProfile.body.perfil.id, pacienteId: patientProfile.body.perfil.id, tipoSesionId: sessionType.body.id,
    } });
    status(await request('/api/turnos/' + pastSlot.id + '/cancelar', { method: 'POST', cookie: patient.cookie, body: {} }), 409, 'No cancelar reservas pasadas');
    const history = status(await request('/api/turnos', { cookie: patient.cookie }), 200, 'Historial del paciente').body;
    verify(history.some(t => t.id === pastSlot.id), 'El paciente pierde sus reservas anteriores.');
    console.log('Perfil profesional propio y publico: persistencia, validacion, privacidad y reservas OK.');
    console.log('Flujo completo de turnos, concurrencia y liquidaciones: OK.');
    for (const account of [patient, professional, secondProfessional, otherPatient]) {
      status(await request('/api/auth/logout', { method: 'POST', cookie: account.cookie, body: {} }), 200, 'Logout');
      status(await request('/api/mi-perfil', { cookie: account.cookie }), 401, 'Rechazar sesion cerrada');
    }
    console.log(checks + ' comprobaciones HTTP/Prisma/MySQL correctas con datos ficticios.');
    console.log('Base ficticia conservada sin DROP: ' + testDatabaseName);
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
    await Promise.allSettled([admin?.$disconnect(), prisma?.$disconnect()].filter(Boolean));
    process.env.DATABASE_URL = originalUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalFrontend === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = originalFrontend;
  }
}
main().catch(error => {
  console.error(redact(error.message || 'Fallo la verificacion aislada.'));
  if (testDatabaseName) console.error('Nombre reservado para esta prueba: ' + testDatabaseName + '. No se elimino ninguna base.');
  process.exitCode = 1;
});


