-- CreateTable
CREATE TABLE `ColegioPsicologo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `distrito` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `direccion` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObraSocial` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ObraSocial_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TipoSesion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `precioBase` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lugar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `direccion` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Psicologo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nroMatricula` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `direccion` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `colegioId` INTEGER NOT NULL,

    UNIQUE INDEX `Psicologo_nroMatricula_key`(`nroMatricula`),
    UNIQUE INDEX `Psicologo_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Paciente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dni` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `fechaNacimiento` DATETIME(3) NOT NULL,
    `obraSocialId` INTEGER NULL,

    UNIQUE INDEX `Paciente_dni_key`(`dni`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Turno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `horaIni` TIME NOT NULL,
    `horaFin` TIME NOT NULL,
    `estado` VARCHAR(191) NOT NULL,
    `modalidad` VARCHAR(191) NOT NULL,
    `psicologoId` INTEGER NOT NULL,
    `tipoSesionId` INTEGER NOT NULL,
    `lugarId` INTEGER NULL,
    `pacienteId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Liquidacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `valorTotal` DECIMAL(10, 2) NOT NULL,
    `fechaEmision` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `estado` VARCHAR(191) NOT NULL,
    `psicologoId` INTEGER NOT NULL,
    `obraSocialId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ObraSocialToPsicologo` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ObraSocialToPsicologo_AB_unique`(`A`, `B`),
    INDEX `_ObraSocialToPsicologo_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_LugarToPsicologo` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_LugarToPsicologo_AB_unique`(`A`, `B`),
    INDEX `_LugarToPsicologo_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_PacienteToPsicologo` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_PacienteToPsicologo_AB_unique`(`A`, `B`),
    INDEX `_PacienteToPsicologo_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Psicologo` ADD CONSTRAINT `Psicologo_colegioId_fkey` FOREIGN KEY (`colegioId`) REFERENCES `ColegioPsicologo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Paciente` ADD CONSTRAINT `Paciente_obraSocialId_fkey` FOREIGN KEY (`obraSocialId`) REFERENCES `ObraSocial`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_psicologoId_fkey` FOREIGN KEY (`psicologoId`) REFERENCES `Psicologo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_tipoSesionId_fkey` FOREIGN KEY (`tipoSesionId`) REFERENCES `TipoSesion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_lugarId_fkey` FOREIGN KEY (`lugarId`) REFERENCES `Lugar`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Turno` ADD CONSTRAINT `Turno_pacienteId_fkey` FOREIGN KEY (`pacienteId`) REFERENCES `Paciente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Liquidacion` ADD CONSTRAINT `Liquidacion_psicologoId_fkey` FOREIGN KEY (`psicologoId`) REFERENCES `Psicologo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Liquidacion` ADD CONSTRAINT `Liquidacion_obraSocialId_fkey` FOREIGN KEY (`obraSocialId`) REFERENCES `ObraSocial`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ObraSocialToPsicologo` ADD CONSTRAINT `_ObraSocialToPsicologo_A_fkey` FOREIGN KEY (`A`) REFERENCES `ObraSocial`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ObraSocialToPsicologo` ADD CONSTRAINT `_ObraSocialToPsicologo_B_fkey` FOREIGN KEY (`B`) REFERENCES `Psicologo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_LugarToPsicologo` ADD CONSTRAINT `_LugarToPsicologo_A_fkey` FOREIGN KEY (`A`) REFERENCES `Lugar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_LugarToPsicologo` ADD CONSTRAINT `_LugarToPsicologo_B_fkey` FOREIGN KEY (`B`) REFERENCES `Psicologo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PacienteToPsicologo` ADD CONSTRAINT `_PacienteToPsicologo_A_fkey` FOREIGN KEY (`A`) REFERENCES `Paciente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PacienteToPsicologo` ADD CONSTRAINT `_PacienteToPsicologo_B_fkey` FOREIGN KEY (`B`) REFERENCES `Psicologo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
