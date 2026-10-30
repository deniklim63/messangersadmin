-- AlterTable
ALTER TABLE "Bot" ADD COLUMN     "aiNotifyChatId" TEXT;

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "fileId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRequest_subscriberId_createdAt_idx" ON "AiRequest"("subscriberId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRequest_botId_createdAt_idx" ON "AiRequest"("botId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
