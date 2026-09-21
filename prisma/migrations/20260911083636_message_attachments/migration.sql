-- AlterTable
ALTER TABLE "MediaFile" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'scenario';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachments" JSONB;
