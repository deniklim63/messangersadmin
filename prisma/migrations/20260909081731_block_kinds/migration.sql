-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('MESSAGE', 'REQUEST', 'CODE');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ScenarioBlock" ADD COLUMN     "body" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "kind" "BlockKind" NOT NULL DEFAULT 'MESSAGE',
ADD COLUMN     "method" TEXT DEFAULT 'GET',
ADD COLUMN     "nextBlockId" TEXT,
ADD COLUMN     "saveAs" TEXT,
ADD COLUMN     "url" TEXT;

-- AddForeignKey
ALTER TABLE "ScenarioBlock" ADD CONSTRAINT "ScenarioBlock_nextBlockId_fkey" FOREIGN KEY ("nextBlockId") REFERENCES "ScenarioBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
