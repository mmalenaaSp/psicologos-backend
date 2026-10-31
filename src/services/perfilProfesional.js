const camposTexto = Object.freeze({
  fotoUrl: 2048,
  tituloProfesional: 191,
  enfoqueProfesional: 191,
  descripcionPublica: 5000,
  dirigidoA: 500,
  idiomas: 191,
});
const camposPublicos = Object.freeze([...Object.keys(camposTexto), 'modalidadPublica', 'aceptaReintegro']);
const seleccionCamposPublicos = Object.fromEntries(camposPublicos.map(campo => [campo, true]));
const seleccionLugar = { id: true, nombre: true, direccion: true };
const seleccionPerfil = { ...seleccionCamposPublicos, lugares: { select: { id: true } } };
const filtroProfesionalPublico = { activo: true, usuario: { is: { estado: 'ACTIVO', rol: 'PSICOLOGO' } } };
const seleccionPublica = {
  id: true, nombre: true, apellido: true, nroMatricula: true,
  ...seleccionCamposPublicos,
  obrasSociales: { select: { id: true, nombre: true } },
  lugares: { select: seleccionLugar },
};
class ErrorPerfilProfesional extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const rechazar = (message) => { throw new ErrorPerfilProfesional(400, message); };
function idPositivo(valor) {
  if (!['number', 'string'].includes(typeof valor) || !/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor) > 2147483647) {
    rechazar('El identificador debe ser un entero positivo.');
  }
  return Number(valor);
}
function validarEdicion(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(campo => ![...camposPublicos, 'lugaresIds'].includes(campo))) {
    rechazar('El perfil profesional contiene campos no permitidos.');
  }
  const datos = {};
  for (const [campo, limite] of Object.entries(camposTexto)) {
    if (!Object.hasOwn(body, campo)) continue;
    const valor = body[campo];
    if (valor !== null && typeof valor !== 'string') rechazar(`El campo ${campo} debe ser texto.`);
    const limpio = valor == null ? null : valor.trim() || null;
    if (limpio != null && (limpio.length > limite || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(limpio))) {
      rechazar(`El campo ${campo} admite hasta ${limite} caracteres y no permite caracteres de control.`);
    }
    datos[campo] = limpio;
  }
  if (datos.fotoUrl) {
    let foto;
    try { foto = new URL(datos.fotoUrl); } catch { rechazar('La foto debe tener una URL HTTPS válida.'); }
    if (foto.protocol !== 'https:' || !foto.hostname || foto.username || foto.password || /[\s\\]/.test(datos.fotoUrl)) {
      rechazar('La foto debe tener una URL HTTPS sin credenciales.');
    }
  }
  if (Object.hasOwn(body, 'modalidadPublica')) {
    if (body.modalidadPublica !== null && !['PRESENCIAL', 'VIRTUAL', 'AMBAS'].includes(body.modalidadPublica)) {
      rechazar('Seleccioná una modalidad pública válida.');
    }
    datos.modalidadPublica = body.modalidadPublica;
  }
  if (Object.hasOwn(body, 'aceptaReintegro')) {
    if (typeof body.aceptaReintegro !== 'boolean') rechazar('Indicá si aceptás reintegro con un valor booleano.');
    datos.aceptaReintegro = body.aceptaReintegro;
  }
  if (Object.hasOwn(body, 'lugaresIds')) {
    if (!Array.isArray(body.lugaresIds) || body.lugaresIds.length > 100) rechazar('Seleccioná hasta 100 lugares de atención.');
    datos.lugaresIds = [...new Set(body.lugaresIds.map(idPositivo))];
  }
  return datos;
}
function proyectarCampos(perfil) {
  return Object.fromEntries(camposPublicos.map(campo => [campo, perfil[campo] ?? (campo === 'aceptaReintegro' ? false : null)]));
}
function proyectarPublico(perfil) {
  if (!perfil) return null;
  return {
    ...Object.fromEntries(['id', 'nombre', 'apellido', 'nroMatricula'].map(campo => [campo, perfil[campo]])),
    ...proyectarCampos(perfil),
    obrasSociales: (perfil.obrasSociales || []).map(({ id, nombre }) => ({ id, nombre })),
    lugares: (perfil.lugares || []).map(({ id, nombre, direccion }) => ({ id, nombre, direccion })),
  };
}
function respuestaPrivada(perfil, lugares) {
  return {
    perfil: { ...proyectarCampos(perfil), lugaresIds: (perfil.lugares || []).map(lugar => lugar.id) },
    lugaresDisponibles: lugares.map(({ id, nombre, direccion }) => ({ id, nombre, direccion })),
  };
}
function dondePropio(usuario) {
  if (usuario?.rol !== 'PSICOLOGO' || !usuario.perfilCompleto || usuario.psicologoId == null) {
    throw new ErrorPerfilProfesional(403, 'Completá tu perfil de profesional para acceder.');
  }
  return {
    id: idPositivo(usuario.psicologoId), activo: true,
    usuario: { is: { id: idPositivo(usuario.id), estado: 'ACTIVO', rol: 'PSICOLOGO' } },
  };
}
function crearServicioPerfilProfesional(prisma) {
  const lugaresPropios = (db, usuario) => db.lugar.findMany({
    where: { propietarioId: usuario.id }, select: seleccionLugar, orderBy: { nombre: 'asc' },
  });
  return {
    async obtenerPrivado(usuario) {
      const where = dondePropio(usuario);
      const [perfil, lugares] = await Promise.all([
        prisma.psicologo.findFirst({ where, select: seleccionPerfil }),
        lugaresPropios(prisma, usuario),
      ]);
      if (!perfil) throw new ErrorPerfilProfesional(404, 'Perfil profesional no encontrado.');
      return respuestaPrivada(perfil, lugares);
    },
    async guardarPrivado(usuario, body) {
      const where = dondePropio(usuario);
      const { lugaresIds, ...datos } = validarEdicion(body);
      return prisma.$transaction(async tx => {
        if (!await tx.psicologo.findFirst({ where, select: { id: true } })) {
          throw new ErrorPerfilProfesional(404, 'Perfil profesional no encontrado.');
        }
        if (lugaresIds !== undefined) {
          // Publicar una dirección requiere seleccionar explícitamente un Lugar propio.
          const permitidos = await tx.lugar.findMany({ where: { id: { in: lugaresIds }, propietarioId: usuario.id }, select: { id: true } });
          if (permitidos.length !== lugaresIds.length) rechazar('Uno de los lugares no te pertenece o ya no está disponible.');
          datos.lugares = { set: lugaresIds.map(id => ({ id })) };
        }
        const perfil = await tx.psicologo.update({ where, data: datos, select: seleccionPerfil });
        return respuestaPrivada(perfil, await lugaresPropios(tx, usuario));
      }, { isolationLevel: 'Serializable' });
    },
    async obtenerPublico(valor) {
      const perfil = await prisma.psicologo.findFirst({ where: { id: idPositivo(valor), ...filtroProfesionalPublico }, select: seleccionPublica });
      if (!perfil) throw new ErrorPerfilProfesional(404, 'Profesional no encontrado.');
      return proyectarPublico(perfil);
    },
  };
}
module.exports = {
  crearServicioPerfilProfesional, validarEdicion, proyectarPublico, seleccionCamposPublicos,
  filtroProfesionalPublico, ErrorPerfilProfesional,
};
