function requerirRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Iniciá sesión.' });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para acceder a este recurso.' });
    }
    return next();
  };
}
function requerirPerfilCompleto(req, res, next) {
  if (!req.usuario?.perfilCompleto) {
    return res.status(403).json({ error: 'Completá tu perfil para acceder a tu espacio.', codigo: 'PERFIL_INCOMPLETO' });
  }
  return next();
}
module.exports = { requerirRol, requerirPerfilCompleto };
