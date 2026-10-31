const { PrismaClient } = require('@prisma/client');
const { incluirPerfil, perfilDe, cuentaPermitida, datosPublicos } = require('../services/perfilUsuario');
const prisma = new PrismaClient();
class ErrorPerfil extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
function texto(valor, nombre) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > 191) {
    throw new ErrorPerfil(400, `El campo ${nombre} es obligatorio y admite hasta 191 caracteres.`);
  }
  return valor.trim();
}
function idPositivo(valor) {
  if (!['string', 'number'].includes(typeof valor) || !/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor) > 2147483647) {
    throw new ErrorPerfil(400, 'El identificador debe ser un entero positivo.');
  }
  return Number(valor);
}
function validar(body, rol) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorPerfil(400, 'Enviá un perfil válido.');
  const campos = rol === 'PSICOLOGO'
    ? ['nombre', 'apellido', 'telefono', 'direccion', 'nroMatricula', 'colegioId', 'colegio']
    : ['nombre', 'apellido', 'telefono', 'dni', 'fechaNacimiento', 'obraSocialId'];
  if (Object.keys(body).some(campo => !campos.includes(campo))) throw new ErrorPerfil(400, 'El perfil contiene campos no permitidos.');
  const datos = Object.fromEntries(['nombre', 'apellido', 'telefono'].map(campo => [campo, texto(body[campo], campo)]));
  if (rol === 'PSICOLOGO') {
    datos.nroMatricula = texto(body.nroMatricula, 'nroMatricula');
    datos.direccion = texto(body.direccion, 'direccion');
    if ((body.colegioId != null) === (body.colegio != null)) throw new ErrorPerfil(400, 'Elegí un colegio o ingresá los datos de uno nuevo.');
    if (body.colegioId != null) datos.colegioId = idPositivo(body.colegioId);
    else {
      if (typeof body.colegio !== 'object' || Array.isArray(body.colegio) || Object.keys(body.colegio).some(key => !['distrito', 'nombre', 'direccion'].includes(key))) {
        throw new ErrorPerfil(400, 'Los datos del colegio son inválidos.');
      }
      datos.colegio = Object.fromEntries(['distrito', 'nombre', 'direccion'].map(campo => [campo, texto(body.colegio[campo], campo)]));
    }
  } else {
    datos.dni = texto(body.dni, 'dni');
    const valor = body.fechaNacimiento;
    const fecha = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00.000Z`) : new Date(NaN);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor || fecha > new Date()) {
      throw new ErrorPerfil(400, 'La fecha de nacimiento es inválida.');
    }
    datos.fechaNacimiento = fecha;
    datos.obraSocialId = body.obraSocialId == null ? null : idPositivo(body.obraSocialId);
  }
  return datos;
}
function respuesta(usuario) { return { usuario: datosPublicos(usuario), perfil: perfilDe(usuario) || null }; }
function manejarError(error, res) {
  if (error instanceof ErrorPerfil) return res.status(error.status).json({ error: error.message });
  if (['P2002', 'P2025', 'P2034'].includes(error.code)) {
    return res.status(409).json({ error: 'No se pudo guardar el perfil con esos datos. Ninguna ficha existente fue vinculada. Revisá los datos y volvé a intentar.' });
  }
  if (error.code === 'P2003') return res.status(400).json({ error: 'La referencia seleccionada no está disponible.' });
  console.error('Error al guardar perfil:', error.code || error.name);
  return res.status(500).json({ error: 'No se pudo guardar el perfil.' });
}
function obtenerMiPerfil(req, res) { return res.json(respuesta(req.cuenta)); }
async function opcionesPerfil(req, res) {
  try {
    const where = { OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] };
    const coberturaPaciente = { OR: [...where.OR, { psicologos: { some: { activo: true, usuario: { is: { estado: 'ACTIVO', rol: 'PSICOLOGO' } } } } }] };
    const [colegios, obrasSociales] = await Promise.all([
      prisma.colegioPsicologo.findMany({ where, select: { id: true, nombre: true, distrito: true }, orderBy: { nombre: 'asc' } }),
      prisma.obraSocial.findMany({ where: req.usuario.rol === 'PACIENTE' ? coberturaPaciente : where, select: { id: true, nombre: true, codigo: true }, orderBy: { nombre: 'asc' } }),
    ]);
    return res.json({ colegios, obrasSociales });
  } catch (error) { return manejarError(error, res); }
}
async function guardarMiPerfil(req, res) {
  try {
    const datos = validar(req.body, req.usuario.rol);
    const resultado = await prisma.$transaction(async tx => {
      const cuenta = await tx.usuario.findUnique({ where: { id: req.usuario.id }, include: incluirPerfil });
      if (!cuenta || !cuentaPermitida(cuenta)) throw new ErrorPerfil(403, 'La cuenta no tiene acceso.');
      const profesional = cuenta.rol === 'PSICOLOGO';
      const donde = { OR: [{ propietarioId: cuenta.id }, { propietarioId: null }] };
      if (profesional) {
        if (datos.colegio) {
          const { colegio, ...campos } = datos;
          Object.assign(datos, campos);
          delete datos.colegio;
          const nuevo = await tx.colegioPsicologo.create({ data: { ...colegio, propietarioId: cuenta.id } });
          datos.colegioId = nuevo.id;
        } else if (!await tx.colegioPsicologo.findFirst({ where: { id: datos.colegioId, ...donde }, select: { id: true } })) {
          throw new ErrorPerfil(400, 'El colegio seleccionado no está disponible.');
        }
      } else if (datos.obraSocialId != null && !await tx.obraSocial.findFirst({ where: { id: datos.obraSocialId, OR: [...donde.OR, { psicologos: { some: { activo: true, usuario: { is: { estado: 'ACTIVO', rol: 'PSICOLOGO' } } } } }] }, select: { id: true } })) {
        throw new ErrorPerfil(400, 'La obra social seleccionada no está disponible.');
      }
      const campoId = profesional ? 'psicologoId' : 'pacienteId';
      const modelo = profesional ? tx.psicologo : tx.paciente;
      const idActual = cuenta[campoId];
      let perfil;
      if (idActual != null) {
        // El ID procede de la cuenta autenticada, nunca del formulario.
        perfil = await modelo.update({ where: { id: idActual, activo: true }, data: datos });
      } else {
        perfil = await modelo.create({ data: {
          ...datos,
          ...(profesional ? { email: cuenta.email, contraseña: cuenta.passwordHash }
            : { propietarioId: cuenta.id }),
        } });
      }
      // Condición sobre ambos vínculos evita reemplazar un perfil creado concurrentemente.
      await tx.usuario.update({ where: { id: cuenta.id, AND: [{ psicologoId: cuenta.psicologoId }, { pacienteId: cuenta.pacienteId }] }, data: {
        [campoId]: perfil.id, estado: 'ACTIVO',
      } });
      const actualizada = await tx.usuario.findUnique({ where: { id: cuenta.id }, include: incluirPerfil });
      return respuesta(actualizada);
    }, { isolationLevel: 'Serializable' });
    return res.json(resultado);
  } catch (error) { return manejarError(error, res); }
}
module.exports = { obtenerMiPerfil, opcionesPerfil, guardarMiPerfil };

