-- Extensión aditiva: las cuentas existentes conservan sus datos y relaciones.
ALTER TABLE `Psicologo`
    ADD COLUMN `fotoUrl` VARCHAR(2048) NULL,
    ADD COLUMN `tituloProfesional` VARCHAR(191) NULL,
    ADD COLUMN `enfoqueProfesional` VARCHAR(191) NULL,
    ADD COLUMN `descripcionPublica` TEXT NULL,
    ADD COLUMN `dirigidoA` VARCHAR(500) NULL,
    ADD COLUMN `idiomas` VARCHAR(191) NULL,
    ADD COLUMN `modalidadPublica` ENUM('PRESENCIAL', 'VIRTUAL', 'AMBAS') NULL,
    ADD COLUMN `aceptaReintegro` BOOLEAN NOT NULL DEFAULT false;
