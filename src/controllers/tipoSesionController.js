const tipoSesionService = require('../services/tipoSesionService');

function validarDatos(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { error: 'Debes enviar nombre y precio base.' };
  }

  const permitidos = ['nombre', 'precioBase'];
  if (Object.keys(datos).some(campo => !permitidos.includes(campo))) {
    return { error: 'Se enviaron campos no permitidos.' };
  }

  const nombre = datos.nombre;
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100) {
    return { error: 'El nombre es obligatorio y no puede superar los 100 caracteres.' };
  }

  const precioTexto = String(datos.precioBase ?? '').trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(precioTexto)) {
    return { error: 'El precio base debe ser un número positivo con hasta dos decimales.' };
  }

  return {
    data: {
      nombre: nombre.trim(),
      precioBase: Number(precioTexto)
    }
  };
}

function validarId(idTexto) {
  const id = Number(idTexto);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const crearTipoSesion = async (req, res) => {
  const validacion = validarDatos(req.body);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }

  try {
    const tipoSesion = await tipoSesionService.crear(validacion.data, req.usuario.id);
    return res.status(201).json(tipoSesion);
  } catch (error) {
    console.error('Error al crear el tipo de sesión:', error);
    return res.status(500).json({ error: 'No se pudo crear el tipo de sesión.' });
  }
};

const obtenerTiposSesion = async (req, res) => {
  const nombre = typeof req.query.nombre === 'string' ? req.query.nombre.trim() : '';

  try {
    const tiposSesion = await tipoSesionService.listar(nombre, req.usuario.id);
    return res.status(200).json(tiposSesion);
  } catch (error) {
    console.error('Error al listar tipos de sesión:', error);
    return res.status(500).json({ error: 'No se pudieron cargar los tipos de sesión.' });
  }
};

const obtenerTipoSesionPorId = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });
  }

  try {
    const tipoSesion = await tipoSesionService.buscarPorId(id, req.usuario.id);
    if (!tipoSesion) {
      return res.status(404).json({ error: 'No se encontró el tipo de sesión.' });
    }
    return res.status(200).json(tipoSesion);
  } catch (error) {
    console.error('Error al buscar el tipo de sesión:', error);
    return res.status(500).json({ error: 'No se pudo cargar el tipo de sesión.' });
  }
};

const actualizarTipoSesion = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });
  }

  const validacion = validarDatos(req.body);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }

  try {
    const tipoSesion = await tipoSesionService.actualizar(id, validacion.data, req.usuario.id);
    return res.status(200).json(tipoSesion);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'No se encontró el tipo de sesión.' });
    }
    console.error('Error al actualizar el tipo de sesión:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el tipo de sesión.' });
  }
};

const borrarTipoSesion = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });
  }

  try {
    await tipoSesionService.eliminar(id, req.usuario.id);
    return res.status(200).json({ mensaje: 'Tipo de sesión eliminado correctamente.' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'No se encontró el tipo de sesión.' });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar este tipo de sesión porque tiene turnos asociados.'
      });
    }
    console.error('Error al eliminar el tipo de sesión:', error);
    return res.status(500).json({ error: 'No se pudo eliminar el tipo de sesión.' });
  }
};

module.exports = {
  crearTipoSesion,
  obtenerTiposSesion,
  obtenerTipoSesionPorId,
  actualizarTipoSesion,
  borrarTipoSesion
};
