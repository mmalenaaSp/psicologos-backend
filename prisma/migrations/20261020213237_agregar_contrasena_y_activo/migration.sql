/*
  Warnings:

  - Added the required column `contraseña` to the `Psicologo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `paciente` ADD COLUMN `activo` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `psicologo` ADD COLUMN `activo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `contraseña` VARCHAR(191) NOT NULL;
