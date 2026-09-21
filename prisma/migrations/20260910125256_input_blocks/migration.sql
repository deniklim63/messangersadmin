-- AlterEnum
ALTER TYPE "BlockKind" ADD VALUE 'INPUT';

-- AlterTable
ALTER TABLE "ScenarioBlock" ADD COLUMN     "inputKind" TEXT;
