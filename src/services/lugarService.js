const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const camposRespuesta = { id: true, nombre: true, direccion: true };

function propiedad(propietarioId) {
  if (!Number.isSafeInteger(propietarioId) || propietarioId <= 0) {
    throw new Error('Se requiere un propietario autenticado.');
  }
  return { propietarioId };
}

function listar(filtro, propietarioId) {
  return prisma.lugar.findMany({
    where: {
      ...propiedad(propietarioId),
      ...(filtro ? {
        OR: [
          { nombre: { contains: filtro } },
          { direccion: { contains: filtro } }
        ]
      } : {})
    },
    orderBy: { nombre: 'asc' },
    select: camposRespuesta
  });
}

function buscarPorId(id, propietarioId) {
  return prisma.lugar.findUnique({
    where: { id, ...propiedad(propietarioId) },
    select: camposRespuesta
  });
}

function crear(datos, propietarioId) {
  return prisma.lugar.create({
    data: { ...datos, ...propiedad(propietarioId) },
    select: camposRespuesta
  });
}

function actualizar(id, datos, propietarioId) {
  return prisma.lugar.update({
    where: { id, ...propiedad(propietarioId) },
    data: datos,
    select: camposRespuesta
  });
}

function eliminar(id, propietarioId) {
  return prisma.lugar.delete({
    where: { id, ...propiedad(propietarioId) },
    select: { id: true }
  });
}

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
