-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlockKind" ADD VALUE 'CONDITION';
ALTER TYPE "BlockKind" ADD VALUE 'DELAY';
ALTER TYPE "BlockKind" ADD VALUE 'HANDOFF';

-- AlterTable
ALTER TABLE "ScenarioBlock" ADD COLUMN     "conditions" JSONB,
ADD COLUMN     "delaySeconds" INTEGER;

-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN     "needsOperator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "operatorSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ScheduledStep" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledStep_runAt_idx" ON "ScheduledStep"("runAt");

-- AddForeignKey
ALTER TABLE "ScheduledStep" ADD CONSTRAINT "ScheduledStep_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
