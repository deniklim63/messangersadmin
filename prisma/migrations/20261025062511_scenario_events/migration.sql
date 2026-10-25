-- CreateTable
CREATE TABLE "ScenarioEvent" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "buttonId" TEXT,
    "subscriberId" TEXT,
    "kind" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioEvent_blockId_kind_idx" ON "ScenarioEvent"("blockId", "kind");

-- CreateIndex
CREATE INDEX "ScenarioEvent_buttonId_idx" ON "ScenarioEvent"("buttonId");

-- AddForeignKey
ALTER TABLE "ScenarioEvent" ADD CONSTRAINT "ScenarioEvent_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ScenarioBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
