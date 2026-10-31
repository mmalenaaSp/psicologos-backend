const lugarService = require('../services/lugarService');

function validarId(idTexto) {
  const id = Number(idTexto);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validarDatos(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { error: 'Debes enviar nombre y dirección.' };
  }

  const permitidos = ['nombre', 'direccion'];
  if (Object.keys(datos).some(campo => !permitidos.includes(campo))) {
    return { error: 'Se enviaron campos no permitidos.' };
  }

  const nombre = datos.nombre;
  const direccion = datos.direccion;
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100) {
    return { error: 'El nombre es obligatorio y no puede superar los 100 caracteres.' };
  }
  if (typeof direccion !== 'string' || !direccion.trim() || direccion.trim().length > 200) {
    return { error: 'La dirección es obligatoria y no puede superar los 200 caracteres.' };
  }

  return { data: { nombre: nombre.trim(), direccion: direccion.trim() } };
}

const crearLugar = async (req, res) => {
  const validacion = validarDatos(req.body);
  if (validacion.error) return res.status(400).json({ error: validacion.error });

  try {
    const lugar = await lugarService.crear(validacion.data, req.usuario.id);
    return res.status(201).json(lugar);
  } catch (error) {
    console.error('Error al crear el lugar:', error);
    return res.status(500).json({ error: 'No se pudo crear el lugar.' });
  }
};

const obtenerLugares = async (req, res) => {
  const filtro = typeof req.query.filtro === 'string' ? req.query.filtro.trim() : '';
  try {
    const lugares = await lugarService.listar(filtro, req.usuario.id);
    return res.status(200).json(lugares);
  } catch (error) {
    console.error('Error al listar lugares:', error);
    return res.status(500).json({ error: 'No se pudieron cargar los lugares.' });
  }
};

const obtenerLugarPorId = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  try {
    const lugar = await lugarService.buscarPorId(id, req.usuario.id);
    if (!lugar) return res.status(404).json({ error: 'No se encontró el lugar.' });
    return res.status(200).json(lugar);
  } catch (error) {
    console.error('Error al buscar el lugar:', error);
    return res.status(500).json({ error: 'No se pudo cargar el lugar.' });
  }
};

const actualizarLugar = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  const validacion = validarDatos(req.body);
  if (validacion.error) return res.status(400).json({ error: validacion.error });

  try {
    const lugar = await lugarService.actualizar(id, validacion.data, req.usuario.id);
    return res.status(200).json(lugar);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'No se encontró el lugar.' });
    }
    console.error('Error al actualizar el lugar:', error);
    return res.status(500).json({ error: 'No se pudo actualizar el lugar.' });
  }
};

const borrarLugar = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  try {
    await lugarService.eliminar(id, req.usuario.id);
    return res.status(200).json({ mensaje: 'Lugar eliminado correctamente.' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'No se encontró el lugar.' });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar este lugar porque tiene turnos asociados.'
      });
    }
    console.error('Error al eliminar el lugar:', error);
    return res.status(500).json({ error: 'No se pudo eliminar el lugar.' });
  }
};

module.exports = { crearLugar, obtenerLugares, obtenerLugarPorId, actualizarLugar, borrarLugar };
