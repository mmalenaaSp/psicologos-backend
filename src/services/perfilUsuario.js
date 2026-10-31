const camposPsicologo = {
  id: true, nroMatricula: true, nombre: true, apellido: true, telefono: true,
  direccion: true, email: true, activo: true, colegioId: true,
};
const camposPaciente = {
  id: true, dni: true, nombre: true, apellido: true, telefono: true,
  fechaNacimiento: true, activo: true, obraSocialId: true,
};
const incluirPerfil = {
  psicologo: { select: camposPsicologo },
  paciente: { select: camposPaciente },
};
function perfilDe(usuario) {
  return usuario.rol === 'PSICOLOGO' ? usuario.psicologo : usuario.paciente;
}
function cuentaPermitida(usuario) {
  if (!['ACTIVO', 'PENDIENTE'].includes(usuario.estado)) return false;
  if (!['PSICOLOGO', 'PACIENTE'].includes(usuario.rol)) return false;
  const profesional = usuario.rol === 'PSICOLOGO';
  if (profesional ? usuario.pacienteId != null : usuario.psicologoId != null) return false;
  const id = profesional ? usuario.psicologoId : usuario.pacienteId;
  return id == null || perfilDe(usuario)?.activo === true;
}
function perfilCompleto(usuario) {
  const perfil = perfilDe(usuario);
  if (usuario.estado !== 'ACTIVO' || !cuentaPermitida(usuario) || !perfil) return false;
  const campos = usuario.rol === 'PSICOLOGO'
    ? ['nombre', 'apellido', 'telefono', 'direccion', 'email', 'nroMatricula']
    : ['nombre', 'apellido', 'telefono', 'dni'];
  if (!campos.every(campo => typeof perfil[campo] === 'string' && perfil[campo].trim())) return false;
  return usuario.rol === 'PSICOLOGO' ? Number.isInteger(perfil.colegioId)
    : perfil.fechaNacimiento != null && !Number.isNaN(new Date(perfil.fechaNacimiento).getTime());
}
function datosPublicos(usuario) {
  return {
    id: usuario.id, email: usuario.email, rol: usuario.rol,
    psicologoId: usuario.psicologoId, pacienteId: usuario.pacienteId,
    nombre: perfilDe(usuario)?.nombre ?? null,
    apellido: perfilDe(usuario)?.apellido ?? null,
    perfilCompleto: perfilCompleto(usuario),
  };
}
module.exports = { incluirPerfil, camposPsicologo, camposPaciente, perfilDe, cuentaPermitida, datosPublicos };
