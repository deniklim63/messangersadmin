-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DONE',
ALTER COLUMN "recipients" SET DEFAULT 0,
ALTER COLUMN "sent" SET DEFAULT 0,
ALTER COLUMN "failed" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "Broadcast_status_scheduledAt_idx" ON "Broadcast"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
