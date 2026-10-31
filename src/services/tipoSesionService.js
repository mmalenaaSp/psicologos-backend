const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const camposRespuesta = { id: true, nombre: true, precioBase: true };

function propiedad(propietarioId) {
  if (!Number.isSafeInteger(propietarioId) || propietarioId <= 0) {
    throw new Error('Se requiere un propietario autenticado.');
  }
  return { propietarioId };
}

function listar(nombre, propietarioId) {
  return prisma.tipoSesion.findMany({
    where: { ...propiedad(propietarioId), ...(nombre ? { nombre: { contains: nombre } } : {}) },
    orderBy: { nombre: 'asc' },
    select: camposRespuesta
  });
}

function buscarPorId(id, propietarioId) {
  return prisma.tipoSesion.findUnique({
    where: { id, ...propiedad(propietarioId) },
    select: camposRespuesta
  });
}

function crear(datos, propietarioId) {
  return prisma.tipoSesion.create({
    data: { ...datos, ...propiedad(propietarioId) },
    select: camposRespuesta
  });
}

function actualizar(id, datos, propietarioId) {
  return prisma.tipoSesion.update({
    where: { id, ...propiedad(propietarioId) },
    data: datos,
    select: camposRespuesta
  });
}

function eliminar(id, propietarioId) {
  return prisma.tipoSesion.delete({
    where: { id, ...propiedad(propietarioId) },
    select: { id: true }
  });
}

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
