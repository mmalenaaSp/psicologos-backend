const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const camposRespuesta = {
  id: true,
  nombre: true,
  precioBase: true
};

function listar(nombre) {
  return prisma.tipoSesion.findMany({
    where: nombre ? { nombre: { contains: nombre } } : undefined,
    orderBy: { nombre: 'asc' },
    select: camposRespuesta
  });
}

function buscarPorId(id) {
  return prisma.tipoSesion.findUnique({
    where: { id },
    select: camposRespuesta
  });
}

function crear(datos) {
  return prisma.tipoSesion.create({
    data: datos,
    select: camposRespuesta
  });
}

function actualizar(id, datos) {
  return prisma.tipoSesion.update({
    where: { id },
    data: datos,
    select: camposRespuesta
  });
}

function eliminar(id) {
  return prisma.tipoSesion.delete({ where: { id }, select: { id: true } });
}

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
