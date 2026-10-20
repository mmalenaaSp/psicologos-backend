// Importamos Prisma (asumiendo que ya lo tenés instanciado en otro archivo)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const bcrypt = require('bcrypt');

// 1. CREATE (Crear psicólogo con validaciones y seguridad)
const crearPsicologo = async (req, res) => {
  try {
    // 1. Desempaquetamos los datos individualmente en lugar de agarrar todo el req.body junto
    const { nroMatricula, nombre, apellido, telefono, direccion, email, password, colegioId } = req.body;

    // 2. VALIDACIÓN: Evitamos procesar si faltan datos clave
    if (!nroMatricula || !nombre || !email || !password || !colegioId) {
      // El 'return' hace que la función muera acá y no siga ejecutando lo de abajo
      return res.status(400).json({ error: "Faltan enviar datos obligatorios" });
    }

    // 3. ENCRIPTACIÓN: Generamos el hash de la contraseña
    // El "salt" (sal) son caracteres aleatorios que bcrypt le suma a la contraseña para hacerla indescifrable
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    // 4. GUARDADO: Le pasamos los datos a Prisma
    const nuevoPsicologo = await prisma.psicologo.create({
      data: {
        nroMatricula: nroMatricula,
        nombre: nombre,
        apellido: apellido,
        telefono: telefono,
        direccion: direccion,
        email: email,
        colegioId: Number(colegioId), // Aseguramos que sea número
        password: passwordEncriptada  // <-- ¡Guardamos el texto encriptado, no la contraseña real!
      }
    });

    // 5. LIMPIEZA: Es una pésima práctica devolver la contraseña (incluso encriptada) al frontend
    // Con esta línea separamos el password del resto de los datos
    const { password: _, ...psicologoSinPassword } = nuevoPsicologo;

    // Devolvemos el psicólogo creado (sin su contraseña) con código 201
    res.status(201).json(psicologoSinPassword);

  } catch (error) {
    // Si el email o la matrícula ya existen, Prisma tira error y cae acá automáticamente
    res.status(500).json({ error: "Error al crear el psicólogo", detalle: error.message });
  }
};

// 2. READ (Obtener todos los psicólogos - Método GET)
const obtenerPsicologos = async (req, res) => {
  try {
    const listaPsicologos = await prisma.psicologo.findMany({
        where:{
            activo: true  //es la validación para que traiga solo los psicologos activos
        }
    });
    res.status(200).json(listaPsicologos);
  } catch (error) {
    res.status(500).json({ error: "Error al buscar los psicólogos" });
  }
};

// 3. UPDATE (Actualizar un psicólogo - Método PUT/PATCH)
const actualizarPsicologo = async (req, res) => {
  try {
    // req.params.id trae el ID desde la URL (ej: /api/psicologos/5)
    const { id } = req.params;
    const datosNuevos = req.body;

    const psicologoActualizado = await prisma.psicologo.update({
      where: { id: Number(id) },
      data: datosNuevos
    });

    res.status(200).json(psicologoActualizado);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar el psicólogo" });
  }
};

// 4. DELETE (Borrar un psicólogo - Método DELETE)
const borrarPsicologo = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.psicologo.update({
      where: { id: Number(id) },
      data: { activo: false }
    });

    res.status(200).json({ mensaje: "Psicólogo eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al borrar el psicólogo" });
  }
};

// Finalmente, exportamos todas las funciones para usarlas en tus rutas
module.exports = {
  crearPsicologo,
  obtenerPsicologos,
  actualizarPsicologo,
  borrarPsicologo
};