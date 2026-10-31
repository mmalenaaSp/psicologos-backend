-- Migración aditiva: no modifica liquidaciones ni turnos existentes.
CREATE TABLE `LiquidacionDetalle` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `liquidacionId` INTEGER NOT NULL,
  `turnoId` INTEGER NOT NULL,
  `importe` DECIMAL(10,2) NOT NULL,
  `sesion` VARCHAR(191) NOT NULL,
  `fechaSesion` DATE NOT NULL,
  `paciente` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `LiquidacionDetalle_turnoId_key` (`turnoId`),
  INDEX `LiquidacionDetalle_liquidacionId_idx` (`liquidacionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `LiquidacionDetalle_liquidacionId_fkey` FOREIGN KEY (`liquidacionId`) REFERENCES `Liquidacion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `LiquidacionDetalle_turnoId_fkey` FOREIGN KEY (`turnoId`) REFERENCES `Turno` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
