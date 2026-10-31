
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { incluirPerfil, cuentaPermitida, datosPublicos } = require('../services/perfilUsuario');

const prisma = new PrismaClient();
const HASH_DESCONOCIDO = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

const registrarUsuario = async (req, res) => {
  try {
    const { email, password, rol } = req.body || {};
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(campo => !['email', 'password', 'rol'].includes(campo))) {
      return res.status(400).json({ error: 'El registro contiene campos no permitidos.' });
    }

    const emailNormalizado =
      typeof email === 'string'
        ? email.trim().toLowerCase()
        : '';

    const emailValido =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado) &&
      emailNormalizado.length <= 191;

    if (!emailValido) {
      return res.status(400).json({
        error: 'Ingresá un correo electrónico válido.'
      });
    }

    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 12 caracteres y no superar 72 bytes.'
      });
    }

    if (!['PSICOLOGO', 'PACIENTE'].includes(rol)) {
      return res.status(400).json({
        error: 'Seleccioná un tipo de usuario válido.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.usuario.create({
      data: {
        email: emailNormalizado,
        passwordHash,
        rol,
        estado: 'ACTIVO'
      }
    });

    return res.status(201).json({ mensaje: 'Cuenta creada. Ya podés ingresar y completar tu perfil.' });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'No se pudo crear la cuenta con esos datos. Si ya tenés cuenta, iniciá sesión.' });
    }

    console.error('Error al registrar usuario:', error.code || error.name);

    return res.status(500).json({
      error: 'No se pudo procesar la solicitud.'
    });
  }
};


const COOKIE_NAME = 'pg_sesion';
const DURACION_SESION = 4 * 60 * 60 * 1000;

const opcionesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
};

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

// POST /api/auth/login
const iniciarSesion = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      email.trim().length > 191 ||
      !password ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        error: 'Ingresá correo y contraseña.'
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: {
        email: email.trim().toLowerCase()
      },
      include: incluirPerfil
    });

    const coincide = await bcrypt.compare(password, usuario?.passwordHash || HASH_DESCONOCIDO);
    const credencialesCorrectas = Boolean(usuario) && coincide;

    if (!credencialesCorrectas) {
      return res.status(401).json({
        error: 'Correo o contraseña incorrectos.'
      });
    }

    if (!cuentaPermitida(usuario)) {
      return res.status(403).json({
        error: 'La cuenta está bloqueada o su perfil fue dado de baja.'
      });
    }

    // Cada login recibe un identificador aleatorio nuevo.
    const token = crypto.randomBytes(32).toString('base64url');

    const expiraEn = new Date(
      Date.now() + DURACION_SESION
    );

    // Si ya había una sesión, invalidamos la anterior.
    const tokenAnterior = req.cookies?.[COOKIE_NAME];

    if (tokenAnterior) {
      await prisma.sesion.deleteMany({
        where: { tokenHash: hashToken(tokenAnterior) }
      });
    }

    await prisma.sesion.create({
      data: {
        tokenHash: hashToken(token),
        usuarioId: usuario.id,
        expiraEn
      }
    });

    res.cookie(COOKIE_NAME, token, {
      ...opcionesCookie,
      maxAge: DURACION_SESION
    });

    return res.status(200).json({
      mensaje: 'Sesión iniciada correctamente.',
      usuario: datosPublicos(usuario)
    });

  } catch (error) {
    console.error('Error al iniciar sesión:', error.code || error.name);

    return res.status(500).json({
      error: 'No se pudo iniciar sesión.'
    });
  }
};

// Middleware: verifica una sesión existente.
const requerirSesion = async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];

    if (
      typeof token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(token)
    ) {
      return res.status(401).json({
        error: 'No hay una sesión válida.'
      });
    }

    const sesion = await prisma.sesion.findUnique({
      where: {
        tokenHash: hashToken(token)
      },
      include: { usuario: { include: incluirPerfil } }
    });

    if (!sesion || sesion.expiraEn <= new Date()) {
      return res.status(401).json({
        error: 'La sesión expiró o no existe.'
      });
    }

    const usuario = sesion.usuario;

    if (!cuentaPermitida(usuario)) {
      return res.status(403).json({
        error: 'Cuenta sin autorización vigente.'
      });
    }

    req.cuenta = usuario;
    req.usuario = datosPublicos(usuario);
    req.sesionId = sesion.id;

    return next();

  } catch (error) {
    console.error('Error al verificar sesión:', error.code || error.name);

    return res.status(500).json({
      error: 'No se pudo verificar la sesión.'
    });
  }
};

// GET /api/auth/me
const obtenerMiCuenta = (req, res) => {
  return res.status(200).json({
    usuario: req.usuario
  });
};

// POST /api/auth/logout
const cerrarSesion = async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];

    if (token) {
      await prisma.sesion.deleteMany({
        where: {
          tokenHash: hashToken(token)
        }
      });
    }

    res.clearCookie(COOKIE_NAME, opcionesCookie);

    return res.status(200).json({
      mensaje: 'Sesión cerrada correctamente.'
    });

  } catch (error) {
    console.error('Error al cerrar sesión:', error.code || error.name);

    return res.status(500).json({
      error: 'No se pudo cerrar la sesión.'
    });
  }
};

module.exports = {
  registrarUsuario,
  iniciarSesion,
  requerirSesion,
  obtenerMiCuenta,
  cerrarSesion
};