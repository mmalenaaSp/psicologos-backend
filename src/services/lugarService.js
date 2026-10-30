const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const camposRespuesta = { id: true, nombre: true, direccion: true };

function listar(filtro) {
  return prisma.lugar.findMany({
    where: filtro
      ? {
          OR: [
            { nombre: { contains: filtro } },
            { direccion: { contains: filtro } }
          ]
        }
      : undefined,
    orderBy: { nombre: 'asc' },
    select: camposRespuesta
  });
}

function buscarPorId(id) {
  return prisma.lugar.findUnique({ where: { id }, select: camposRespuesta });
}

function crear(datos) {
  return prisma.lugar.create({ data: datos, select: camposRespuesta });
}

function actualizar(id, datos) {
  return prisma.lugar.update({ where: { id }, data: datos, select: camposRespuesta });
}

function eliminar(id) {
  return prisma.lugar.delete({ where: { id }, select: { id: true } });
}

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
