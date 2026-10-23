// Importamos Prisma (asumiendo que ya lo tenés instanciado en otro archivo)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const bcrypt = require('bcrypt');

//1. CREATE
const crearPsicologo = async (req, res) => {
  try {
    const {
      nroMatricula,
      nombre,
      apellido,
      telefono,
      direccion,
      email,
      password,
      colegioId
    } = req.body;

    // 1. Validamos todos los campos obligatorios
    const campos = {
      nroMatricula,
      nombre,
      apellido,
      telefono,
      direccion,
      email,
      password
    };

    const datosInvalidos = Object.values(campos).some(
      valor => typeof valor !== 'string' || !valor.trim()
    );
    //convertimos los valores del objeto en un arreglo, .some() revisa los elementos del arreglo 
    // y devuelve true si al menos uno cumple la condición indicada.
    //

    const idColegio = Number(colegioId);

    if (
      datosInvalidos ||
      !Number.isInteger(idColegio) ||
      idColegio <= 0
    ) {
      return res.status(400).json({
        error: "Faltan datos obligatorios o son inválidos"
      });
    }

    // 2. Generamos un hash seguro de la contraseña
    const passwordEncriptada = await bcrypt.hash(password, 10);

    // 3. Creamos el psicólogo
    const nuevoPsicologo = await prisma.psicologo.create({
      data: {
        nroMatricula: nroMatricula.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        email: email.trim().toLowerCase(),
        contraseña: passwordEncriptada,
        colegioId: idColegio
      },

      // 4. Indicamos qué campos se pueden devolver
      select: {
        id: true,
        nroMatricula: true,
        nombre: true,
        apellido: true,
        telefono: true,
        direccion: true,
        email: true,
        activo: true,
        colegioId: true
      }
    });

    return res.status(201).json(nuevoPsicologo);

  } catch (error) {

    if (error.code === 'P2002') {
      return res.status(409).json({
        error: "Ya existe un psicólogo con esa matrícula o email"
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: "El colegio indicado no existe"
      });
    }

    console.error("Error al crear psicólogo:", error);

    return res.status(500).json({
      error: "Error interno al crear el psicólogo"
    });
  }
};


// 2. READ (Obtener todos los psicólogos - Método GET)

const obtenerPsicologos = async (req, res) => {
  try {
    const listaPsicologos = await prisma.psicologo.findMany({
      where: {
        activo: true
      },
      select: {
        id: true,
        nroMatricula: true,
        nombre: true,
        apellido: true,
        telefono: true,
        direccion: true,
        email: true,
        colegioId: true
      }
    });

    res.status(200).json(listaPsicologos);

  } catch (error) {
    res.status(500).json({
      error: "Error al buscar los psicólogos"
    });
  }
};

const obtenerPsicologoPorId = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido"
      });
    }

    const psicologo = await prisma.psicologo.findFirst({
      where: {
        id: id,
        activo: true
      },
      select: {
        id: true,
        nroMatricula: true,
        nombre: true,
        apellido: true,
        telefono: true,
        direccion: true,
        email: true,
        colegioId: true
      }
    });

    if (!psicologo) {
      return res.status(404).json({
        error: "Psicólogo no encontrado"
      });
    }

    res.status(200).json(psicologo);

  } catch (error) {
    res.status(500).json({
      error: "Error al buscar el psicólogo"
    });
  }
};

// 3. UPDATE (Actualizar un psicólogo - Método PUT/PATCH)
const actualizarPsicologo = async (req, res) => {
  try {
    //1. Obtenemos y validamos id
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido"
      })
    }

    //2. verificamos que el cuerpo sea un objeto válido
    const datosNuevos = req.body;

    if (
      !datosNuevos || typeof datosNuevos !== 'object' || Array.isArray(datosNuevos) )
      {
      return res.status(400).json({
        error: "Debes enviar datos para actualizar"
      });
    }

    //3. DEfinimos que campos se pueden actualizar
    const camposPermitidos = [
      'nroMatricula',
      'nombre',
      'apellido',
      'telefono',
      'direccion',
      'email',
      'colegioId'
    ];
    
    // Obtenemos los nombres de los campos enviados
    const datosEnviados = Object.keys(datosNuevos);

    if (
      datosEnviados.length === 0 || datosEnviados.some(campo => !camposPermitidos.includes(campo))
    ) {
      return res.status(400).json({
        error: "Campos no permitidos"
      });
    }

    // 4. Validamos y preparamos los datos
    const datosValidados = {};

    for (const campo of datosEnviados) {
      const valor = datosNuevos[campo];

      if (campo === 'colegioId') {
        const idValido =
          (typeof valor === 'number' && Number.isInteger(valor)) ||
          (typeof valor === 'string' && /^\d+$/.test(valor.trim()));

        if (!idValido || Number(valor) <= 0) {
          return res.status(400).json({
            error: "El ID del colegio debe ser un entero positivo"
          });
        }

        datosValidados.colegioId = Number(valor);
      } else {
        if (typeof valor !== 'string' || !valor.trim()) {
          return res.status(400).json({
            error: `El campo ${campo} es inválido`
          });
        }

        datosValidados[campo] =
          campo === 'email'
            ? valor.trim().toLowerCase()
            : valor.trim();
      }
    }

    // 5. Actualizamos solamente si está activo
    const resultado = await prisma.psicologo.updateMany({
      where: {
        id: id,
        activo: true
      },
      data: datosValidados
    });

    if (resultado.count === 0) {
      return res.status(404).json({
        error: "Psicólogo activo no encontrado"
      });
    }

    // 6. Obtenemos los datos que podemos devolver
    const psicologoActualizado = await prisma.psicologo.findUnique({
      where: { id: id },
      select: {
        id: true,
        nroMatricula: true,
        nombre: true,
        apellido: true,
        telefono: true,
        direccion: true,
        email: true,
        activo: true,
        colegioId: true
      }
    });

    return res.status(200).json(psicologoActualizado);

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: "La matrícula o el email ya están registrados"
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: "El colegio indicado no existe"
      });
    }

    console.error("Error al actualizar psicólogo:", error);

    return res.status(500).json({
      error: "Error interno al actualizar el psicólogo"
    });
  }
};

// 4. DELETE (Borrar un psicólogo - Método DELETE)

const borrarPsicologo = async (req, res) => {
  try {
    // 1. Obtenemos y validamos el ID
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido"
      });
    }

    // 2. Realizamos la baja lógica
    const resultado = await prisma.psicologo.updateMany({
      where: {
        id: id,
        activo: true
      },
      data: {
        activo: false
      }
    });

    // 3. Verificamos si se encontró un psicólogo activo
    if (resultado.count === 0) {
      return res.status(404).json({
        error: "Psicólogo activo no encontrado"
      });
    }

    // 4. Devolvemos la respuesta
    return res.status(200).json({
      mensaje: "Psicólogo dado de baja correctamente"
    });

  } catch (error) {
    console.error("Error al borrar psicólogo:", error);

    return res.status(500).json({
      error: "Error interno al borrar el psicólogo"
    });
  }
};


// Finalmente, exportamos todas las funciones para usarlas en tus rutas
module.exports = {
  crearPsicologo,
  obtenerPsicologos,
  obtenerPsicologoPorId,
  actualizarPsicologo,
  borrarPsicologo
};