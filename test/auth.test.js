'use strict';
// Synthetic HTTP integration tests: Prisma is replaced in memory before loading the app.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
const password = 'Solo-pruebas-2026!';
const users = [];
const sessions = [];
const storage = {};
let crudCalls = 0;
let server, baseUrl, professionalCookie, otherProfessionalCookie, patientCookie;
const endpoints = ['psicologos', 'pacientes', 'tipos-sesion', 'lugares', 'colegios', 'obras-sociales'];
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const dbError = code => Object.assign(new Error('Synthetic database constraint'), { code });

function matches(record, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(item => matches(record, item));
    if (key === 'OR') return value.some(item => matches(record, item));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(item => matches(record, item));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('contains' in value) return String(record[key]).includes(value.contains);
      if ('lte' in value) return record[key] <= value.lte;
      if ('lt' in value) return record[key] < value.lt;
      if ('in' in value) return value.in.includes(record[key]);
      if ('not' in value) return record[key] !== value.not;
      if ('equals' in value) return record[key] === value.equals;
    }
    return record[key] === value;
  });
}
function project(row, options = {}) {
  if (!row) return null;
  const result = options.select
    ? Object.fromEntries(Object.keys(options.select).filter(key => options.select[key]).map(key => [key, row[key]]))
    : { ...row };
  if (options.include?._count) result._count = Object.fromEntries(Object.keys(options.include._count.select).map(key => [key, 0]));
  return result;
}
const required = {
  psicologo: ['nroMatricula', 'nombre', 'apellido', 'telefono', 'direccion', 'email', 'contraseña', 'colegioId'],
  paciente: ['dni', 'nombre', 'apellido', 'telefono', 'fechaNacimiento'],
  colegioPsicologo: ['nombre', 'distrito', 'direccion'], obraSocial: ['codigo', 'nombre'],
  lugar: ['nombre', 'direccion'], tipoSesion: ['nombre', 'precioBase']
};
const unique = { psicologo: ['nroMatricula', 'email'], paciente: ['dni'], obraSocial: ['codigo'] };
function validateRecord(model, row, existing) {
  for (const key of required[model] || []) if (row[key] == null || row[key] === '') throw dbError('P2011');
  for (const key of unique[model] || []) {
    if (storage[model].some(other => other !== existing && other[key] === row[key])) throw dbError('P2002');
  }
  for (const [key, relatedModel] of Object.entries({ colegioId: 'colegioPsicologo', obraSocialId: 'obraSocial', propietarioId: 'usuario' })) {
    if (row[key] != null) {
      const related = relatedModel === 'usuario' ? users : storage[relatedModel];
      if (!related?.some(record => record.id === row[key])) throw dbError('P2003');
    }
  }
}
// Storage delegates enforce required fields, unique constraints and foreign keys.
function memoryModel(model, initial) {
  storage[model] = initial;
  const rows = () => storage[model];
  return {
    async findMany(options = {}) {
      crudCalls++;
      return rows().filter(row => matches(row, options.where)).map(row => project(row, options));
    },
    async findUnique(options) {
      crudCalls++;
      return project(rows().find(row => matches(row, options.where)), options);
    },
    async findFirst(options = {}) {
      crudCalls++;
      return project(rows().find(row => matches(row, options.where)), options);
    },
    async create(options) {
      crudCalls++;
      const row = { id: Math.max(0, ...rows().map(item => item.id)) + 1, activo: true, propietarioId: null, ...options.data };
      validateRecord(model, row);
      rows().push(row);
      return project(row, options);
    },
    async updateMany(options) {
      crudCalls++;
      const affected = rows().filter(row => matches(row, options.where));
      affected.forEach(row => validateRecord(model, { ...row, ...options.data }, row));
      affected.forEach(row => Object.assign(row, options.data));
      return { count: affected.length };
    },
    async update(options) {
      crudCalls++;
      const row = rows().find(item => matches(item, options.where));
      if (!row) throw dbError('P2025');
      validateRecord(model, { ...row, ...options.data }, row);
      Object.assign(row, options.data);
      return project(row, options);
    },
    async deleteMany(options) {
      crudCalls++;
      const before = rows().length;
      storage[model] = rows().filter(row => !matches(row, options.where));
      return { count: before - rows().length };
    },
    async delete(options) {
      crudCalls++;
      const index = rows().findIndex(row => matches(row, options.where));
      if (index < 0) throw dbError('P2025');
      return project(rows().splice(index, 1)[0], options);
    }
  };
}
function accountView(user, options = {}) {
  if (!user) return null;
  const full = { ...user };
  for (const model of ['psicologo', 'paciente']) {
    const relation = options.include?.[model] || options.select?.[model];
    if (relation) full[model] = project(storage[model]?.find(row => row.id === user[model + 'Id']), relation === true ? {} : relation);
  }
  return project(full, options);
}
const prisma = {
  usuario: {
    async findUnique(options) { return accountView(users.find(user => matches(user, options.where)), options); },
    async findFirst(options) { return accountView(users.find(user => matches(user, options.where)), options); },
    async create(options) {
      if (users.some(user => user.email === options.data.email)) throw dbError('P2002');
      const user = { id: Math.max(0, ...users.map(row => row.id)) + 1, psicologoId: null, pacienteId: null, ...options.data };
      users.push(user);
      return accountView(user, options);
    },
    async update(options) {
      const user = users.find(row => matches(row, options.where));
      if (!user) throw dbError('P2025');
      for (const key of ['email', 'psicologoId', 'pacienteId']) {
        if (options.data[key] != null && users.some(other => other !== user && other[key] === options.data[key])) throw dbError('P2002');
      }
      Object.assign(user, options.data);
      return accountView(user, options);
    },
    async updateMany(options) {
      const affected = users.filter(row => matches(row, options.where));
      affected.forEach(row => Object.assign(row, options.data));
      return { count: affected.length };
    }
  },
  sesion: {
    async create({ data }) {
      const session = { id: Math.max(0, ...sessions.map(row => row.id)) + 1, ...data };
      sessions.push(session); return session;
    },
    async findUnique(options) {
      const session = sessions.find(item => matches(item, options.where));
      return session ? { ...session, usuario: accountView(users.find(user => user.id === session.usuarioId), options.include?.usuario || {}) } : null;
    },
    async deleteMany({ where }) {
      let count = 0;
      for (let index = sessions.length - 1; index >= 0; index--) {
        if (matches(sessions[index], where)) { sessions.splice(index, 1); count++; }
      }
      return { count };
    }
  },
  psicologo: memoryModel('psicologo', [
    { id: 1, activo: true, nroMatricula: 'TEST-DOC-1', nombre: 'Profesional', apellido: 'Ficticio', telefono: 'TEST', direccion: 'Ficticia', email: 'profesional@example.test', contraseña: 'synthetic-hash', colegioId: 1 },
    { id: 2, activo: true, nroMatricula: 'TEST-DOC-2', nombre: 'Otra profesional', apellido: 'Ficticia', telefono: 'TEST', direccion: 'Ficticia', email: 'otra@example.test', contraseña: 'synthetic-hash', colegioId: 1 },
    { id: 3, activo: true, nroMatricula: 'TEST-LEGACY', nombre: 'Legado', apellido: 'Ficticio', telefono: 'TEST', direccion: 'Ficticia', email: 'legacy@example.test', contraseña: 'synthetic-hash', colegioId: 1 }
  ]),
  paciente: memoryModel('paciente', [
    { id: 1, activo: true, propietarioId: 2, nombre: 'Paciente personal', apellido: 'Ficticio', dni: 'TEST-PERSONAL', telefono: 'TEST', fechaNacimiento: new Date('2000-01-01') },
    { id: 2, activo: true, propietarioId: 1, nombre: 'Paciente doctor uno', apellido: 'Ficticio', dni: 'TEST-DOC1-PATIENT', telefono: 'TEST', fechaNacimiento: new Date('2000-01-01') },
    { id: 3, activo: true, propietarioId: 4, nombre: 'Paciente doctor dos', apellido: 'Ficticio', dni: 'TEST-DOC2-PATIENT', telefono: 'TEST', fechaNacimiento: new Date('2000-01-01') },
    { id: 4, activo: true, propietarioId: null, nombre: 'Paciente anterior', apellido: 'Ficticio', dni: 'TEST-LEGACY-PATIENT', telefono: 'TEST', fechaNacimiento: new Date('2000-01-01') }
  ]),
  tipoSesion: memoryModel('tipoSesion', [
    { id: 1, propietarioId: 1, nombre: 'Tipo uno', precioBase: 100 },
    { id: 2, propietarioId: 4, nombre: 'Tipo dos', precioBase: 200 },
    { id: 3, propietarioId: null, nombre: 'Tipo anterior', precioBase: 300 }
  ]),
  lugar: memoryModel('lugar', [
    { id: 1, propietarioId: 1, nombre: 'Lugar uno', direccion: 'Ficticia' },
    { id: 2, propietarioId: 4, nombre: 'Lugar dos', direccion: 'Ficticia' },
    { id: 3, propietarioId: null, nombre: 'Lugar anterior', direccion: 'Ficticia' }
  ]),
  colegioPsicologo: memoryModel('colegioPsicologo', [
    { id: 1, propietarioId: null, distrito: 'Ficticio', nombre: 'Colegio compartido', direccion: 'Ficticia' },
    { id: 2, propietarioId: 1, distrito: 'Ficticio', nombre: 'Colegio uno', direccion: 'Ficticia' },
    { id: 3, propietarioId: 4, distrito: 'Ficticio', nombre: 'Colegio dos', direccion: 'Ficticia' }
  ]),
  obraSocial: memoryModel('obraSocial', [
    { id: 1, propietarioId: null, codigo: 'TEST-SHARED', nombre: 'Obra compartida' },
    { id: 2, propietarioId: 1, codigo: 'TEST-DOC1', nombre: 'Obra uno' },
    { id: 3, propietarioId: 4, codigo: 'TEST-DOC2', nombre: 'Obra dos' }
  ]),
  async $transaction(callback) {
    const snapshot = structuredClone({ users, storage });
    try { return await callback(prisma); }
    catch (error) {
      users.splice(0, users.length, ...snapshot.users);
      for (const model of Object.keys(storage)) storage[model] = snapshot.storage[model];
      throw error;
    }
  }
};
// Never load a generated Prisma client or contact DATABASE_URL.
const prismaPath = require.resolve('@prisma/client');
const originalPrisma = require.cache[prismaPath];
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { PrismaClient: class { constructor() { return prisma; } } } };
const app = require('../src/index');
async function request(path, { method = 'GET', cookie, body, origin } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}
function cookieFrom(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header?.startsWith('pg_sesion='));
  return header.split(';')[0];
}
function seededSession(user, expiration = new Date(Date.now() + 60000)) {
  const token = crypto.randomBytes(32).toString('base64url');
  const session = { id: Math.max(0, ...sessions.map(row => row.id)) + 1, tokenHash: digest(token), usuarioId: user.id, expiraEn: expiration };
  sessions.push(session);
  return { cookie: 'pg_sesion=' + token, session };
}
const patientProfile = (dni = 'TEST-NEW-PATIENT') => ({
  dni, nombre: 'Persona', apellido: 'Ficticia', telefono: 'TEST', fechaNacimiento: '2000-02-29', obraSocialId: null
});
const professionalProfile = (nroMatricula = 'TEST-NEW-DOC') => ({
  nroMatricula, nombre: 'Profesional nuevo', apellido: 'Ficticio', telefono: 'TEST', direccion: 'Ficticia', colegioId: 1
});
function assertPublicProfile(response) {
  const serialized = JSON.stringify(response.body);
  for (const key of ['passwordHash', 'contraseña', '"sesiones"', '"tokenHash"']) assert.ok(!serialized.includes(key), key + ' must never be exposed');
  assert.ok(!serialized.includes(password));
}
before(async () => {
  const passwordHash = await bcrypt.hash(password, 4);
  users.push(
    { id: 1, email: 'profesional@example.test', passwordHash, rol: 'PSICOLOGO', estado: 'ACTIVO', psicologoId: 1, pacienteId: null },
    { id: 2, email: 'paciente@example.test', passwordHash, rol: 'PACIENTE', estado: 'ACTIVO', psicologoId: null, pacienteId: 1 },
    { id: 3, email: 'pendiente@example.test', passwordHash, rol: 'PSICOLOGO', estado: 'PENDIENTE', psicologoId: null, pacienteId: null },
    { id: 4, email: 'otra@example.test', passwordHash, rol: 'PSICOLOGO', estado: 'ACTIVO', psicologoId: 2, pacienteId: null },
    { id: 5, email: 'bloqueada@example.test', passwordHash, rol: 'PACIENTE', estado: 'BLOQUEADO', psicologoId: null, pacienteId: null }
  );
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  professionalCookie = seededSession(users[0]).cookie;
  patientCookie = seededSession(users[1]).cookie;
  otherProfessionalCookie = seededSession(users[3]).cookie;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (originalPrisma) require.cache[prismaPath] = originalPrisma;
  else delete require.cache[prismaPath];
});


test('login verifies bcrypt, normalizes email, returns safe fields and restores the session', async () => {
  const response = await request('/api/auth/login', { method: 'POST', body: { email: '  PROFESIONAL@EXAMPLE.TEST ', password } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.usuario, { id: 1, email: users[0].email, rol: 'PSICOLOGO', psicologoId: 1, pacienteId: null, nombre: 'Profesional', apellido: 'Ficticio', perfilCompleto: true });
  for (const flag of [/HttpOnly/i, /SameSite=Strict/i, /Path=\//i, /Max-Age=14400/i]) assert.ok(flag.test(response.headers.get('set-cookie')));
  const cookie = cookieFrom(response);
  const rawToken = cookie.slice('pg_sesion='.length);
  const saved = sessions.find(session => session.tokenHash === digest(rawToken));
  assert.ok(saved);
  assert.notEqual(saved.tokenHash, rawToken);
  assertPublicProfile(response);
  assert.equal((await request('/api/auth/me', { cookie })).body.usuario.perfilCompleto, true);
});
test('invalid, unknown and missing credentials do not create sessions', async () => {
  const count = sessions.length;
  for (const body of [{ email: users[0].email, password: 'incorrecta' }, { email: 'inexistente@example.test', password }]) {
    const response = await request('/api/auth/login', { method: 'POST', body });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await request('/api/auth/login', { method: 'POST', body: {} })).status, 400);
  assert.equal(sessions.length, count);
});
test('blocked accounts and inactive linked profiles cannot log in', async () => {
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: users[4].email, password } })).status, 403);
  storage.psicologo[0].activo = false;
  try {
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: users[0].email, password } })).status, 403);
  } finally { storage.psicologo[0].activo = true; }
});
test('old pending accounts can log in for onboarding without clinical access', async () => {
  const response = await request('/api/auth/login', { method: 'POST', body: { email: users[2].email, password } });
  assert.equal(response.status, 200);
  assert.equal(response.body.usuario.perfilCompleto, false);
  const cookie = cookieFrom(response);
  assert.equal((await request('/api/mi-perfil', { cookie })).body.perfil, null);
  assert.equal((await request('/api/pacientes', { cookie })).status, 403);
  assert.equal(users[2].estado, 'PENDIENTE', 'Login must not mass-activate old users');
});
test('login rotates the token; logout revokes its replacement and clears the cookie', async () => {
  const previous = seededSession(users[0]);
  const login = await request('/api/auth/login', { method: 'POST', cookie: previous.cookie, body: { email: users[0].email, password } });
  assert.equal(login.status, 200);
  const cookie = cookieFrom(login);
  assert.notEqual(cookie, previous.cookie);
  assert.equal((await request('/api/auth/me', { cookie: previous.cookie })).status, 401);
  assert.equal((await request('/api/auth/me', { cookie })).status, 200);
  const logout = await request('/api/auth/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.ok(/pg_sesion=;/.test(logout.headers.get('set-cookie')));
  assert.equal((await request('/api/auth/me', { cookie })).status, 401);
  assert.equal((await request('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
});
test('expired, forged and malformed cookies fail authentication', async () => {
  const expired = seededSession(users[0], new Date(Date.now() - 1000));
  for (const cookie of [undefined, expired.cookie, 'pg_sesion=' + crypto.randomBytes(32).toString('base64url'), 'pg_sesion=malformed']) {
    assert.equal((await request('/api/auth/me', { cookie })).status, 401);
  }
});
test('existing sessions lose authorization immediately after account or profile deactivation', async () => {
  users[0].estado = 'BLOQUEADO';
  try { assert.equal((await request('/api/auth/me', { cookie: professionalCookie })).status, 403); }
  finally { users[0].estado = 'ACTIVO'; }
  storage.paciente[0].activo = false;
  try { assert.equal((await request('/api/mi-perfil', { cookie: patientCookie })).status, 403); }
  finally { storage.paciente[0].activo = true; }
});
test('every CRUD method authenticates and rejects patients before clinical queries', async () => {
  const count = crudCalls;
  for (const resource of endpoints) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const path = '/api/' + resource + (['PUT', 'PATCH', 'DELETE'].includes(method) ? '/1' : '');
      const options = { method, ...(method === 'GET' ? {} : { body: {} }) };
      assert.equal((await request(path, options)).status, 401, method + ' ' + resource);
      assert.equal((await request(path, { ...options, cookie: patientCookie })).status, 403, method + ' ' + resource);
    }
  }
  assert.equal(crudCalls, count);
});
test('own profile IDs come from the authenticated user; password hashes are never exposed', async () => {
  const own = await request('/api/mi-perfil?pacienteId=3&id=3&propietarioId=4', { cookie: patientCookie });
  assert.equal(own.status, 200);
  assert.equal(own.body.perfil.id, 1);
  assert.equal(own.body.usuario.id, 2);
  assertPublicProfile(own);
  const professional = await request('/api/mi-perfil?psicologoId=2', { cookie: professionalCookie });
  assert.equal(professional.status, 200);
  assert.equal(professional.body.perfil.id, 1);
  assertPublicProfile(professional);
  assert.equal((await request('/api/pacientes/3', { cookie: patientCookie })).status, 403);
  assert.equal((await request('/api/mi-perfil')).status, 401);
});
test('new patient registration, login, required profile creation, own portal and logout need no approval', async () => {
  const email = 'alta-paciente@example.test';
  const registration = await request('/api/auth/register', { method: 'POST', body: { email, password, rol: 'PACIENTE' } });
  assert.equal(registration.status, 201);
  assert.ok(!/pendiente|aprobaci[oó]n|verificaci[oó]n/i.test(registration.body.mensaje));
  const user = users.find(row => row.email === email);
  assert.equal(user.estado, 'ACTIVO');
  assert.equal(user.pacienteId, null);
  assert.equal(user.psicologoId, null);
  assert.ok(await bcrypt.compare(password, user.passwordHash));
  const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  assert.equal(login.body.usuario.perfilCompleto, false);
  const cookie = cookieFrom(login);
  assert.equal((await request('/api/mi-perfil', { cookie })).body.perfil, null);
  assert.equal((await request('/api/pacientes', { cookie })).status, 403);
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie, body: { nombre: 'Faltan campos' } })).status, 400);
  assert.equal(users.find(row => row.id === user.id).pacienteId, null);
  const complete = await request('/api/mi-perfil', { method: 'PUT', cookie, body: patientProfile() });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.usuario.perfilCompleto, true);
  assert.equal(storage.paciente.find(row => row.id === complete.body.perfil.id).propietarioId, user.id);
  assert.equal(complete.body.perfil.dni, 'TEST-NEW-PATIENT');
  assertPublicProfile(complete);
  const profileId = complete.body.perfil.id;
  const changed = await request('/api/mi-perfil', { method: 'PUT', cookie, body: { ...patientProfile(), nombre: 'Actualizado ficticio' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.perfil.id, profileId, 'Saving twice must edit the same profile');
  assert.equal((await request('/api/mi-perfil?id=1', { cookie })).body.perfil.id, profileId);
  assert.equal((await request('/api/auth/me', { cookie })).body.usuario.perfilCompleto, true);
  assert.equal((await request('/api/pacientes/1', { cookie })).status, 403);
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, body: {} })).status, 200);
  assert.equal((await request('/api/mi-perfil', { cookie })).status, 401);
});
test('new professionals complete Prisma fields and receive an isolated workspace', async () => {
  const email = 'alta-profesional@example.test';
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { email, password, rol: 'PSICOLOGO' } })).status, 201);
  const user = users.find(row => row.email === email);
  assert.equal(user.psicologoId, null);
  const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  const cookie = cookieFrom(login);
  for (const resource of endpoints) assert.equal((await request('/api/' + resource, { cookie })).status, 403);
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie, body: { ...professionalProfile(), telefono: '' } })).status, 400);
  const profile = { ...professionalProfile(), colegio: { nombre: 'Colegio ficticio alta', distrito: 'Ficticio', direccion: 'Ficticia' } };
  delete profile.colegioId;
  const complete = await request('/api/mi-perfil', { method: 'PUT', cookie, body: profile });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.usuario.perfilCompleto, true);
  assert.equal(complete.body.perfil.email, email);
  assertPublicProfile(complete);
  const stored = storage.psicologo.find(row => row.id === complete.body.perfil.id);
  assert.ok(stored.contraseña, 'The mandatory legacy password field must be supplied');
  assert.ok(await bcrypt.compare(password, stored.contraseña));
  const college = storage.colegioPsicologo.find(row => row.id === stored.colegioId);
  assert.equal(college.propietarioId, user.id);
  const patients = await request('/api/pacientes', { cookie });
  assert.equal(patients.status, 200);
  assert.deepEqual(patients.body, [], 'A new professional must not inherit preexisting clinical records');
  assert.deepEqual((await request('/api/psicologos', { cookie })).body.map(row => row.id), [stored.id]);
  for (const id of [1, 2, 3, 4]) assert.equal((await request('/api/pacientes/' + id, { cookie })).status, 404);
  assert.equal((await request('/api/psicologos/3', { cookie })).status, 404);
  assert.equal((await request('/api/auth/me', { cookie })).body.usuario.perfilCompleto, true);
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, body: {} })).status, 200);
});
test('registration rejects administrative roles, injected identity fields and duplicate accounts', async () => {
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { email: 'admin@example.test', password, rol: 'ADMIN' } })).status, 400);
  const injected = await request('/api/auth/register', {
    method: 'POST', body: { email: 'injected@example.test', password, rol: 'PSICOLOGO', estado: 'ACTIVO', psicologoId: 3, pacienteId: 4, propietarioId: 1 }
  });
  assert.equal(injected.status, 400);
  assert.ok(!users.some(row => row.email === 'injected@example.test'));
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { email: 'alta-paciente@example.test', password, rol: 'PACIENTE' } })).status, 409);
  assert.equal(users.filter(row => row.email === 'alta-paciente@example.test').length, 1);
});


test('profile completion never claims existing records by DNI, email or professional registration number', async () => {
  const user = users.find(row => row.id === 3);
  const cookie = seededSession(user).cookie;
  const beforeProfiles = storage.psicologo.length;
  const beforeColleges = storage.colegioPsicologo.length;
  const conflict = await request('/api/mi-perfil', { method: 'PUT', cookie, body: {
    ...professionalProfile('TEST-LEGACY'),
    colegio: { nombre: 'Revertir si falla', distrito: 'Ficticio', direccion: 'Ficticia' }, colegioId: undefined
  } });
  assert.equal(conflict.status, 409);
  assert.equal(users.find(row => row.id === user.id).psicologoId, null);
  assert.equal(storage.psicologo.length, beforeProfiles);
  assert.equal(storage.colegioPsicologo.length, beforeColleges, 'Failed onboarding must roll back new catalog rows');
  const emailUser = { id: 100, email: 'legacy@example.test', passwordHash: users[0].passwordHash, rol: 'PSICOLOGO', estado: 'ACTIVO', psicologoId: null, pacienteId: null };
  users.push(emailUser);
  const emailCookie = seededSession(emailUser).cookie;
  assert.equal((await request('/api/mi-perfil', { cookie: emailCookie })).body.perfil, null);
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie: emailCookie, body: professionalProfile('TEST-EMAIL-COLLISION') })).status, 409);
  assert.equal(users.find(row => row.id === 100).psicologoId, null);
  const patientUser = { id: 101, email: 'dni-conflict@example.test', passwordHash: users[0].passwordHash, rol: 'PACIENTE', estado: 'ACTIVO', psicologoId: null, pacienteId: null };
  users.push(patientUser);
  const patientSession = seededSession(patientUser).cookie;
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie: patientSession, body: patientProfile('TEST-LEGACY-PATIENT') })).status, 409);
  assert.equal(users.find(row => row.id === 101).pacienteId, null);
  assert.equal((await request('/api/mi-perfil', { cookie: patientSession })).body.perfil, null);
});
test('onboarding rejects role, state, owner, IDs and nested relation injection', async () => {
  const cookie = seededSession(users.find(row => row.id === 3)).cookie;
  for (const patch of [
    { rol: 'PACIENTE' }, { estado: 'ACTIVO' }, { propietarioId: 1 }, { id: 3 }, { psicologoId: 3 },
    { colegio: { nombre: 'Ficticio', distrito: 'Ficticio', direccion: 'Ficticia', propietarioId: 1 } }
  ]) {
    const response = await request('/api/mi-perfil', { method: 'PUT', cookie, body: { ...professionalProfile(), ...patch } });
    assert.equal(response.status, 400, 'Injected fields: ' + Object.keys(patch).join(','));
  }
  assert.equal(users.find(row => row.id === 3).psicologoId, null);
  assert.ok([403, 404, 405].includes((await request('/api/mi-perfil', { method: 'POST', cookie, body: professionalProfile() })).status));
});
test('onboarding options expose shared and own catalogs; other owners cannot be selected', async () => {
  const cookie = seededSession(users.find(row => row.id === 3)).cookie;
  const options = await request('/api/mi-perfil/opciones', { cookie });
  assert.equal(options.status, 200);
  assert.deepEqual(options.body.colegios.map(row => row.id), [1]);
  assert.deepEqual(options.body.obrasSociales.map(row => row.id), [1]);
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie, body: { ...professionalProfile(), colegioId: 3 } })).status, 400);
  const patientOptions = await request('/api/mi-perfil/opciones', { cookie: patientCookie });
  assert.equal(patientOptions.status, 200);
  assert.ok(!patientOptions.body.obrasSociales.some(row => row.id === 2 || row.id === 3));
  assert.equal((await request('/api/mi-perfil', { method: 'PUT', cookie: patientCookie, body: { ...patientProfile('TEST-PERSONAL'), obraSocialId: 3 } })).status, 400);
});
test('professionals see their own patients and identity only; legacy patients remain invisible', async () => {
  for (const [cookie, expectedPatient, expectedDoctor] of [[professionalCookie, 2, 1], [otherProfessionalCookie, 3, 2]]) {
    const patients = await request('/api/pacientes?propietarioId=4', { cookie });
    assert.equal(patients.status, 200);
    assert.deepEqual(patients.body.map(row => row.id), [expectedPatient]);
    assert.deepEqual((await request('/api/psicologos', { cookie })).body.map(row => row.id), [expectedDoctor]);
    for (const id of [1, 2, 3, 4].filter(value => value !== expectedPatient)) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const response = await request('/api/pacientes/' + id, { cookie, method, ...(method === 'PUT' ? { body: { nombre: 'No autorizado' } } : {}) });
        assert.equal(response.status, 404, method + ' patient ' + id);
      }
    }
  }
  assert.equal(storage.paciente.find(row => row.id === 4).nombre, 'Paciente anterior');
  assert.equal(storage.paciente.find(row => row.id === 4).activo, true);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await request('/api/psicologos/2', { cookie: professionalCookie, method, ...(method === 'PUT' ? { body: { nombre: 'No autorizado' } } : {}) })).status, 404);
  }
});
test('private places and session types reject other owners and legacy data on read, update and delete', async () => {
  for (const resource of ['lugares', 'tipos-sesion']) {
    const list = await request('/api/' + resource, { cookie: professionalCookie });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map(row => row.id), [1]);
    for (const id of [2, 3]) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const body = resource === 'lugares' ? { nombre: 'No autorizado', direccion: 'Ficticia' } : { nombre: 'No autorizado', precioBase: 100 };
        assert.equal((await request('/api/' + resource + '/' + id, { method, cookie: professionalCookie, ...(method === 'PUT' ? { body } : {}) })).status, 404);
      }
    }
  }
});
test('shared catalogs are readable but immutable; private catalogs reject other professionals', async () => {
  for (const resource of ['colegios', 'obras-sociales']) {
    const list = await request('/api/' + resource, { cookie: professionalCookie });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map(row => row.id), [1, 2]);
    assert.equal((await request('/api/' + resource + '/1', { cookie: professionalCookie })).status, 200);
    for (const id of [1, 3]) {
      assert.equal((await request('/api/' + resource + '/' + id, { method: 'PUT', cookie: professionalCookie, body: { nombre: 'No autorizado' } })).status, 404);
      assert.equal((await request('/api/' + resource + '/' + id, { method: 'DELETE', cookie: professionalCookie })).status, 404);
    }
    assert.equal((await request('/api/' + resource + '/3', { cookie: professionalCookie })).status, 404);
  }
});
test('patient CRUD is preserved and stores authenticated ownership', async () => {
  const created = await request('/api/pacientes', { method: 'POST', cookie: professionalCookie, body: patientProfile('TEST-CYCLE') });
  assert.equal(created.status, 201);
  assert.equal(created.body.propietarioId, 1);
  const path = '/api/pacientes/' + created.body.id;
  assert.equal((await request(path, { cookie: professionalCookie })).status, 200);
  assert.equal((await request(path, { cookie: otherProfessionalCookie })).status, 404);
  const updated = await request(path, { method: 'PUT', cookie: professionalCookie, body: { nombre: 'Actualizado ficticio' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.nombre, 'Actualizado ficticio');
  assert.equal((await request(path, { method: 'DELETE', cookie: professionalCookie })).status, 200);
  assert.equal((await request(path, { cookie: professionalCookie })).status, 404);
});
test('catalog CRUD cycles remain available within the authenticated owner scope', async () => {
  const fixtures = [
    ['lugares', { nombre: 'Lugar ficticio', direccion: 'Ficticia' }],
    ['tipos-sesion', { nombre: 'Tipo ficticio', precioBase: 123.45 }],
    ['colegios', { distrito: 'Ficticio', nombre: 'Colegio ficticio', direccion: 'Ficticia' }],
    ['obras-sociales', { codigo: 'TEST-CYCLE', nombre: 'Obra ficticia' }]
  ];
  for (const [resource, fixture] of fixtures) {
    const created = await request('/api/' + resource, { method: 'POST', cookie: professionalCookie, body: fixture });
    assert.equal(created.status, 201, 'Create ' + resource);
    const model = { lugares: 'lugar', 'tipos-sesion': 'tipoSesion', colegios: 'colegioPsicologo', 'obras-sociales': 'obraSocial' }[resource];
    assert.equal(storage[model].find(row => row.id === created.body.id).propietarioId, 1);
    const path = '/api/' + resource + '/' + created.body.id;
    assert.equal((await request(path, { cookie: professionalCookie })).status, 200);
    assert.equal((await request(path, { cookie: otherProfessionalCookie })).status, 404);
    const changed = await request(path, { method: 'PUT', cookie: professionalCookie, body: { ...fixture, nombre: 'Actualizado ficticio' } });
    assert.equal(changed.status, 200, 'Update ' + resource);
    assert.equal(changed.body.nombre, 'Actualizado ficticio');
    assert.equal((await request(path, { method: 'DELETE', cookie: professionalCookie })).status, 200);
    assert.equal((await request(path, { cookie: professionalCookie })).status, 404);
  }
});
test('patient CRUD rejects injected ownership and association to another professional catalog', async () => {
  for (const fields of [{ propietarioId: 4 }, { obraSocialId: 3 }, { psicologos: { connect: { id: 2 } } }]) {
    assert.equal((await request('/api/pacientes', { method: 'POST', cookie: professionalCookie, body: { ...patientProfile('TEST-INJECT'), ...fields } })).status, 400);
  }
  assert.equal((await request('/api/pacientes/2', { method: 'PUT', cookie: professionalCookie, body: { propietarioId: 4 } })).status, 400);
  assert.equal((await request('/api/pacientes/2', { method: 'PUT', cookie: professionalCookie, body: { obraSocialId: 3 } })).status, 400);
});
test('untrusted origins cannot mutate data; the frontend receives credentialed CORS', async () => {
  const count = crudCalls;
  assert.equal((await request('/api/lugares', { method: 'POST', cookie: professionalCookie, origin: 'https://untrusted.example.test', body: { nombre: 'Ficticio', direccion: 'Ficticia' } })).status, 403);
  assert.equal(crudCalls, count);
  const allowed = await request('/api/auth/me', { cookie: professionalCookie, origin: process.env.FRONTEND_URL });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  assert.equal(allowed.headers.get('access-control-allow-origin'), process.env.FRONTEND_URL);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
});
test('non-JSON requests and malformed JSON are rejected before database queries', async () => {
  const count = crudCalls;
  const wrongType = await fetch(baseUrl + '/api/lugares', { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: professionalCookie }, body: '{"nombre":"Ficticio"}' });
  assert.equal(wrongType.status, 415);
  await wrongType.text();
  const malformed = await fetch(baseUrl + '/api/lugares', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: professionalCookie }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  await malformed.text();
  assert.equal(crudCalls, count);
});
test('login limits repeated failed attempts from the same client', async () => {
  let limited = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await request('/api/auth/login', { method: 'POST', body: { email: 'inexistente@example.test', password: 'incorrecta' } });
    if (response.status === 429) {
      limited = true; assert.ok(response.headers.has('retry-after')); break;
    }
    assert.equal(response.status, 401);
  }
  assert.ok(limited);
});




test('an old pending account finishes onboarding without manual activation or inherited clinical data', async () => {
  const user = users.find(row => row.id === 3);
  const cookie = seededSession(user).cookie;
  assert.equal(user.estado, 'PENDIENTE');
  assert.equal((await request('/api/pacientes', { cookie })).status, 403);
  const complete = await request('/api/mi-perfil', { method: 'PUT', cookie, body: professionalProfile('TEST-RECOVER-PENDING') });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.usuario.perfilCompleto, true);
  assert.equal(users.find(row => row.id === 3).estado, 'ACTIVO');
  assert.notEqual(complete.body.perfil.id, 3, 'Legacy clinical identity must remain unclaimed');
  const patients = await request('/api/pacientes', { cookie });
  assert.equal(patients.status, 200);
  assert.deepEqual(patients.body, []);
});
test('patient onboarding validates calendar dates and rejects forbidden identity fields', async () => {
  const user = users.find(row => row.id === 101);
  const cookie = seededSession(user).cookie;
  for (const fields of [
    { fechaNacimiento: '2001-02-29' }, { fechaNacimiento: '3000-01-01' }, { fechaNacimiento: '01/01/2000' },
    { dni: '' }, { telefono: '' }, { pacienteId: 4 }, { propietarioId: 1 }, { rol: 'PSICOLOGO' }
  ]) {
    const response = await request('/api/mi-perfil', { method: 'PUT', cookie, body: { ...patientProfile('TEST-VALIDATION'), ...fields } });
    assert.equal(response.status, 400);
  }
  assert.equal(users.find(row => row.id === 101).pacienteId, null);
  assert.equal((await request('/api/mi-perfil', { cookie })).body.perfil, null);
});


test('a pending account with an incomplete preexisting linked profile can complete only that profile', async () => {
  const profileId = Math.max(...storage.psicologo.map(row => row.id)) + 1;
  storage.psicologo.push({
    ...storage.psicologo[0], id: profileId, email: 'pendiente-con-perfil@example.test',
    nroMatricula: 'TEST-PENDING-LINKED', telefono: ''
  });
  const user = {
    id: 102, email: 'pendiente-con-perfil@example.test', passwordHash: users[0].passwordHash,
    rol: 'PSICOLOGO', estado: 'PENDIENTE', psicologoId: profileId, pacienteId: null
  };
  users.push(user);
  const cookie = seededSession(user).cookie;
  const own = await request('/api/mi-perfil?id=3', { cookie });
  assert.equal(own.status, 200);
  assert.equal(own.body.perfil.id, profileId);
  assert.equal(own.body.usuario.perfilCompleto, false);
  assert.equal((await request('/api/pacientes', { cookie })).status, 403);
  const count = storage.psicologo.length;
  const complete = await request('/api/mi-perfil', {
    method: 'PUT', cookie, body: professionalProfile('TEST-PENDING-LINKED')
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.perfil.id, profileId);
  assert.equal(complete.body.usuario.perfilCompleto, true);
  assert.equal(storage.psicologo.length, count, 'Completion must preserve the existing authenticated link');
  assert.equal(users.find(row => row.id === user.id).estado, 'ACTIVO');
  assert.deepEqual((await request('/api/pacientes', { cookie })).body, []);
  assert.equal((await request('/api/pacientes/4', { cookie })).status, 404);
});

