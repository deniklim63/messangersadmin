-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN     "currentBlockId" TEXT;

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioBlock" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageId" TEXT,
    "isStart" BOOLEAN NOT NULL DEFAULT false,
    "keywords" TEXT[],
    "positionX" INTEGER NOT NULL DEFAULT 0,
    "positionY" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioButton" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "targetBlockId" TEXT,

    CONSTRAINT "ScenarioButton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "telegramFileId" TEXT,
    "vkAttachment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scenario_botId_idx" ON "Scenario"("botId");

-- CreateIndex
CREATE INDEX "ScenarioBlock_scenarioId_idx" ON "ScenarioBlock"("scenarioId");

-- CreateIndex
CREATE INDEX "ScenarioButton_blockId_idx" ON "ScenarioButton"("blockId");

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_currentBlockId_fkey" FOREIGN KEY ("currentBlockId") REFERENCES "ScenarioBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioBlock" ADD CONSTRAINT "ScenarioBlock_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioBlock" ADD CONSTRAINT "ScenarioBlock_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioButton" ADD CONSTRAINT "ScenarioButton_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ScenarioBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioButton" ADD CONSTRAINT "ScenarioButton_targetBlockId_fkey" FOREIGN KEY ("targetBlockId") REFERENCES "ScenarioBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
