-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScenarioSchedule" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'once',
    "runAt" TIMESTAMP(3),
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "time" TEXT,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioSchedule_isActive_nextRunAt_idx" ON "ScenarioSchedule"("isActive", "nextRunAt");

-- AddForeignKey
ALTER TABLE "ScenarioSchedule" ADD CONSTRAINT "ScenarioSchedule_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioSchedule" ADD CONSTRAINT "ScenarioSchedule_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ScenarioBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
