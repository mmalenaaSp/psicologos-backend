-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` ENUM('PSICOLOGO', 'PACIENTE') NOT NULL,
    `estado` ENUM('PENDIENTE', 'ACTIVO', 'BLOQUEADO') NOT NULL DEFAULT 'PENDIENTE',
    `psicologoId` INTEGER NULL,
    `pacienteId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Usuario_email_key`(`email`),
    UNIQUE INDEX `Usuario_psicologoId_key`(`psicologoId`),
    UNIQUE INDEX `Usuario_pacienteId_key`(`pacienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_psicologoId_fkey` FOREIGN KEY (`psicologoId`) REFERENCES `Psicologo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_pacienteId_fkey` FOREIGN KEY (`pacienteId`) REFERENCES `Paciente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
