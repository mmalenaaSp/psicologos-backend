const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CREATE: Crear un paciente
const crearPaciente = async (req, res) => {
  try {
    const permitidos = ['dni', 'nombre', 'apellido', 'telefono', 'fechaNacimiento', 'obraSocialId'];
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
        Object.keys(req.body).some(campo => !permitidos.includes(campo))) {
      return res.status(400).json({ error: 'Se enviaron campos no permitidos.' });
    }
    const {
      dni,
      nombre,
      apellido,
      telefono,
      fechaNacimiento,
      obraSocialId
    } = req.body;

    // 1. Validar campos de texto obligatorios
    const campos = { dni, nombre, apellido, telefono };

    const datosInvalidos = Object.values(campos).some(
      valor => typeof valor !== 'string' || !valor.trim()
    );

    if (datosInvalidos) {
      return res.status(400).json({
        error: 'Faltan datos obligatorios o son inválidos'
      });
    }

    // 2. Validar la fecha de nacimiento
    if (
      typeof fechaNacimiento !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)
    ) {
      return res.status(400).json({
        error: 'La fecha debe tener formato AAAA-MM-DD'
      });
    }

    const fecha = new Date(`${fechaNacimiento}T00:00:00.000Z`);

    if (
      Number.isNaN(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== fechaNacimiento ||
      fecha > new Date()
    ) {
      return res.status(400).json({
        error: 'Fecha de nacimiento inválida'
      });
    }

    // 3. Validar la obra social (opcional)
    let idObraSocial = null;

    if (obraSocialId !== undefined && obraSocialId !== null) {
      const id = Number(obraSocialId);

      if (
        typeof obraSocialId === 'boolean' ||
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return res.status(400).json({
          error: 'El ID de la obra social es inválido'
        });
      }

      const obraSocial = await prisma.obraSocial.findFirst({
        where: { id, OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] },
        select: { id: true }
      });
      if (!obraSocial) {
        return res.status(400).json({ error: 'La obra social indicada no est\u00e1 disponible.' });
      }
      idObraSocial = id;
    }

    // 4. Crear el paciente
    const nuevoPaciente = await prisma.paciente.create({
      data: {
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        fechaNacimiento: fecha,
        obraSocialId: idObraSocial,
        propietarioId: req.usuario.id
      }
    });

    return res.status(201).json(nuevoPaciente);

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Ya existe un paciente con ese DNI'
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'La obra social indicada no existe'
      });
    }

    console.error('Error al crear paciente:', error);

    return res.status(500).json({
      error: 'Error interno al crear el paciente'
    });
  }
};

// GET: Obtener todos los pacientes activos
const obtenerPacientes = async (req, res) => {
  try {
    const pacientes = await prisma.paciente.findMany({
      where: {
        activo: true,
        propietarioId: req.usuario.id
      },
      orderBy: {
        id: 'asc'
      }
    });

    return res.status(200).json(pacientes);

  } catch (error) {
    console.error('Error al obtener pacientes:', error);

    return res.status(500).json({
      error: 'Error interno al obtener los pacientes'
    });
  }
};

// GET: Obtener un paciente activo por ID
const obtenerPacientePorId = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que el ID sea un entero positivo
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return res.status(400).json({
        error: 'El ID del paciente es inválido'
      });
    }

    const pacienteId = Number(id);

    const paciente = await prisma.paciente.findFirst({
      where: {
        id: pacienteId,
        activo: true,
        propietarioId: req.usuario.id
      }
    });

    if (!paciente) {
      return res.status(404).json({
        error: 'Paciente no encontrado'
      });
    }

    return res.status(200).json(paciente);

  } catch (error) {
    console.error('Error al obtener paciente:', error);

    return res.status(500).json({
      error: 'Error interno al obtener el paciente'
    });
  }
};

// PUT: Actualizar un paciente activo
const actualizarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validar el ID
    if (
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) > 2147483647
    ) {
      return res.status(400).json({
        error: 'El ID del paciente es inválido'
      });
    }

    const pacienteId = Number(id);

    // 2. Validar que se haya enviado un objeto JSON
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        error: 'Debe enviar un objeto JSON válido'
      });
    }

    // 3. Definir los campos que se pueden modificar
    const camposPermitidos = [
      'dni',
      'nombre',
      'apellido',
      'telefono',
      'fechaNacimiento',
      'obraSocialId'
    ];

    const camposEnviados = Object.keys(req.body);

    if (camposEnviados.length === 0) {
      return res.status(400).json({
        error: 'No se enviaron datos para actualizar'
      });
    }

    // No permitir modificar campos como id o activo
    const camposNoPermitidos = camposEnviados.filter(
      campo => !camposPermitidos.includes(campo)
    );

    if (camposNoPermitidos.length > 0) {
      return res.status(400).json({
        error: 'Se enviaron campos que no pueden modificarse'
      });
    }

    // 4. Validar los campos de texto
    const datosActualizados = {};

    const camposTexto = [
      'dni',
      'nombre',
      'apellido',
      'telefono'
    ];

    for (const campo of camposTexto) {
      if (camposEnviados.includes(campo)) {
        const valor = req.body[campo];

        if (typeof valor !== 'string' || !valor.trim()) {
          return res.status(400).json({
            error: `El campo ${campo} es inválido`
          });
        }

        datosActualizados[campo] = valor.trim();
      }
    }

    // 5. Validar fecha de nacimiento si se envió
    if (camposEnviados.includes('fechaNacimiento')) {
      const { fechaNacimiento } = req.body;

      if (
        typeof fechaNacimiento !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)
      ) {
        return res.status(400).json({
          error: 'La fecha debe tener formato AAAA-MM-DD'
        });
      }

      const fecha = new Date(
        `${fechaNacimiento}T00:00:00.000Z`
      );

      if (
        Number.isNaN(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== fechaNacimiento ||
        fecha > new Date()
      ) {
        return res.status(400).json({
          error: 'Fecha de nacimiento inválida'
        });
      }

      datosActualizados.fechaNacimiento = fecha;
    }

    // 6. Validar obra social si se envió
    if (camposEnviados.includes('obraSocialId')) {
      const { obraSocialId } = req.body;

      if (obraSocialId === null) {
        // Permitir quitar la obra social
        datosActualizados.obraSocialId = null;
      } else {
        const idObraSocial = Number(obraSocialId);

        if (
          typeof obraSocialId === 'boolean' ||
          typeof obraSocialId === 'object' ||
          String(obraSocialId).trim() === '' ||
          !Number.isInteger(idObraSocial) ||
          idObraSocial <= 0 ||
          idObraSocial > 2147483647
        ) {
          return res.status(400).json({
            error: 'El ID de la obra social es inválido'
          });
        }

        const obraSocial = await prisma.obraSocial.findFirst({
          where: { id: idObraSocial, OR: [{ propietarioId: req.usuario.id }, { propietarioId: null }] },
          select: { id: true }
        });
        if (!obraSocial) {
          return res.status(400).json({ error: 'La obra social indicada no est\u00e1 disponible.' });
        }
        datosActualizados.obraSocialId = idObraSocial;
      }
    }

    // 7. Actualizar solamente si el paciente está activo
    const resultado = await prisma.paciente.updateMany({
      where: {
        id: pacienteId,
        activo: true,
        propietarioId: req.usuario.id
      },
      data: datosActualizados
    });

    if (resultado.count === 0) {
      return res.status(404).json({
        error: 'Paciente no encontrado o inactivo'
      });
    }

    // 8. Obtener los datos actualizados
    const pacienteActualizado =
      await prisma.paciente.findUnique({
        where: {
          id: pacienteId,
          propietarioId: req.usuario.id
        }
      });

    return res.status(200).json(pacienteActualizado);

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Ya existe otro paciente con ese DNI'
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'La obra social indicada no existe'
      });
    }

    console.error('Error al actualizar paciente:', error);

    return res.status(500).json({
      error: 'Error interno al actualizar el paciente'
    });
  }
};

// DELETE: Dar de baja lógicamente a un paciente
const borrarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validar el ID
    if (
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) > 2147483647
    ) {
      return res.status(400).json({
        error: 'El ID del paciente es inválido'
      });
    }

    const pacienteId = Number(id);

    // 2. Dar de baja solamente si está activo
    const resultado = await prisma.paciente.updateMany({
      where: {
        id: pacienteId,
        activo: true,
        propietarioId: req.usuario.id
      },
      data: {
        activo: false
      }
    });

    // 3. Comprobar si se actualizó algún registro
    if (resultado.count === 0) {
      return res.status(404).json({
        error: 'Paciente no encontrado o inactivo'
      });
    }

    // 4. Confirmar la baja
    return res.status(200).json({
      mensaje: 'Paciente dado de baja correctamente'
    });

  } catch (error) {
    console.error('Error al borrar paciente:', error);

    return res.status(500).json({
      error: 'Error interno al dar de baja el paciente'
    });
  }
};

module.exports = {
  crearPaciente,
  obtenerPacientes,
  obtenerPacientePorId,
  actualizarPaciente,
  borrarPaciente
};