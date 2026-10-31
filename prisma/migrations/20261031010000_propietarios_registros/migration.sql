-- Columnas opcionales: las fichas anteriores quedan sin propietario y no se reasignan.
ALTER TABLE `ColegioPsicologo` ADD COLUMN `propietarioId` INTEGER NULL;
CREATE INDEX `ColegioPsicologo_propietarioId_idx` ON `ColegioPsicologo` (`propietarioId`);
ALTER TABLE `ColegioPsicologo` ADD CONSTRAINT `ColegioPsicologo_propietarioId_fkey` FOREIGN KEY (`propietarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ObraSocial` ADD COLUMN `propietarioId` INTEGER NULL;
CREATE INDEX `ObraSocial_propietarioId_idx` ON `ObraSocial` (`propietarioId`);
ALTER TABLE `ObraSocial` ADD CONSTRAINT `ObraSocial_propietarioId_fkey` FOREIGN KEY (`propietarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TipoSesion` ADD COLUMN `propietarioId` INTEGER NULL;
CREATE INDEX `TipoSesion_propietarioId_idx` ON `TipoSesion` (`propietarioId`);
ALTER TABLE `TipoSesion` ADD CONSTRAINT `TipoSesion_propietarioId_fkey` FOREIGN KEY (`propietarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Lugar` ADD COLUMN `propietarioId` INTEGER NULL;
CREATE INDEX `Lugar_propietarioId_idx` ON `Lugar` (`propietarioId`);
ALTER TABLE `Lugar` ADD CONSTRAINT `Lugar_propietarioId_fkey` FOREIGN KEY (`propietarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Paciente` ADD COLUMN `propietarioId` INTEGER NULL;
CREATE INDEX `Paciente_propietarioId_idx` ON `Paciente` (`propietarioId`);
ALTER TABLE `Paciente` ADD CONSTRAINT `Paciente_propietarioId_fkey` FOREIGN KEY (`propietarioId`) REFERENCES `Usuario` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

