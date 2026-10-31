
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function crearCrudCatalogo({ modelo, campos, relaciones = [] }) {
  const entidad = prisma[modelo];

  // Validar ID de la URL
  function obtenerId(valor) {
    if (!/^[1-9]\d*$/.test(String(valor))) return null;

    const id = Number(valor);
    return Number.isSafeInteger(id) ? id : null;
  }

  // Validar los datos enviados en POST o PUT
  function validarDatos(body, esCreacion) {
    const entrada = body ?? {};
    const datos = {};

    if (
      typeof entrada !== 'object' ||
      Array.isArray(entrada)
    ) {
      return { error: 'El cuerpo debe ser un objeto JSON.' };
    }

    const noPermitidos = Object.keys(entrada).filter(
      campo => !campos.includes(campo)
    );

    if (noPermitidos.length > 0) {
      return { error: 'Se enviaron campos no permitidos.' };
    }

    for (const campo of campos) {
      const valor = entrada[campo];

      if (esCreacion && valor === undefined) {
        return { error: `El campo ${campo} es obligatorio.` };
      }

      if (valor !== undefined) {
        if (
          typeof valor !== 'string' ||
          valor.trim().length === 0
        ) {
          return {
            error: `El campo ${campo} debe ser un texto no vacío.`
          };
        }

        datos[campo] = valor.trim();
      }
    }

    if (!esCreacion && Object.keys(datos).length === 0) {
      return { error: 'Enviá al menos un campo para actualizar.' };
    }

    return { datos };
  }

  // Manejo centralizado de errores
  function manejarError(error, res) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Ya existe un registro con esos datos únicos.'
      });
    }

    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Registro no encontrado.'
      });
    }

    if (error.code === 'P2003' || error.code === 'P2014') {
      return res.status(409).json({
        error: 'No se puede eliminar: existen registros relacionados.'
      });
    }

    console.error(error);

    return res.status(500).json({
      error: 'Error interno del servidor.'
    });
  }

  // GET / - Listar
  async function listar(req, res) {
    try {
      const registros = await entidad.findMany({
        where: { OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] },
        orderBy: { id: 'asc' }
      });

      return res.json(registros);
    } catch (error) {
      return manejarError(error, res);
    }
  }

  // GET /:id - Obtener por ID
  async function obtenerPorId(req, res) {
    const id = obtenerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    try {
      const registro = await entidad.findFirst({
        where: { id, OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] }
      });

      if (!registro) {
        return res.status(404).json({
          error: 'Registro no encontrado.'
        });
      }

      return res.json(registro);
    } catch (error) {
      return manejarError(error, res);
    }
  }

  // POST / - Crear
  async function crear(req, res) {
    const resultado = validarDatos(req.body, true);

    if (resultado.error) {
      return res.status(400).json({
        error: resultado.error
      });
    }

    try {
      const nuevo = await entidad.create({
        data: { ...resultado.datos, propietarioId: req.usuario.id }
      });

      return res.status(201).json(nuevo);
    } catch (error) {
      return manejarError(error, res);
    }
  }

  // PUT /:id - Actualizar
  async function actualizar(req, res) {
    const id = obtenerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const resultado = validarDatos(req.body, false);

    if (resultado.error) {
      return res.status(400).json({
        error: resultado.error
      });
    }

    try {
      const actualizado = await entidad.update({
        where: { id, propietarioId: req.usuario.id },
        data: resultado.datos
      });

      return res.json(actualizado);
    } catch (error) {
      return manejarError(error, res);
    }
  }

  // DELETE /:id - Eliminar si no tiene relaciones
  async function eliminar(req, res) {
    const id = obtenerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    try {
      const opciones = { where: { id, propietarioId: req.usuario.id } };

      if (relaciones.length > 0) {
        const select = Object.fromEntries(
          relaciones.map(relacion => [relacion, true])
        );

        opciones.include = {
          _count: { select }
        };
      }

      const registro = await entidad.findUnique(opciones);

      if (!registro) {
        return res.status(404).json({
          error: 'Registro no encontrado.'
        });
      }

      if (
        registro._count &&
        Object.values(registro._count).some(cantidad => cantidad > 0)
      ) {
        return res.status(409).json({
          error: 'No se puede eliminar: existen registros relacionados.'
        });
      }

      await entidad.delete({
        where: { id, propietarioId: req.usuario.id }
      });

      return res.json({
        mensaje: 'Registro eliminado correctamente.'
      });
    } catch (error) {
      return manejarError(error, res);
    }
  }

  return {
    listar,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
  };
}

module.exports = crearCrudCatalogo;
