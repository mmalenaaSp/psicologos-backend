const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Listado inicial de Obras Sociales del catálogo global
const obrasSocialesIniciales = [
  { codigo: 'OSDE', nombre: 'OSDE' },
  { codigo: 'SWISS', nombre: 'Swiss Medical' },
  { codigo: 'IAPOS', nombre: 'IAPOS' },
  { codigo: 'GALENO', nombre: 'Galeno' },
  { codigo: 'OMINT', nombre: 'Omint' },
  { codigo: 'MEDIFE', nombre: 'Medifé' },
  { codigo: 'SANCOR', nombre: 'Sancor Salud' },
];

async function main() {
  console.log('Cargando catálogo inicial de Obras Sociales...');

  for (const os of obrasSocialesIniciales) {
    // upsert evita duplicados: si la obra social ya existe la ignora, si no la crea
    await prisma.obraSocial.upsert({
      where: { codigo: os.codigo },
      update: {},
      create: {
        codigo: os.codigo,
        nombre: os.nombre,
      },
    });
  }

  console.log('¡Catálogo de Obras Sociales cargado con éxito!');
}

main()
  .catch((e) => {
    console.error('Error al ejecutar el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });