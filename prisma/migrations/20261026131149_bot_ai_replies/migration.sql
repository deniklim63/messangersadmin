-- AlterTable
ALTER TABLE "Bot" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiHandoff" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiKnowledge" TEXT,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiPrompt" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "source" TEXT;
