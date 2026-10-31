-- Migración aditiva: no modifica los registros existentes.
CREATE TABLE `Sesion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tokenHash` CHAR(64) NOT NULL,
  `usuarioId` INTEGER NOT NULL,
  `expiraEn` DATETIME(3) NOT NULL,
  `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Sesion_tokenHash_key` (`tokenHash`),
  INDEX `Sesion_usuarioId_idx` (`usuarioId`),
  INDEX `Sesion_expiraEn_idx` (`expiraEn`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Sesion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
