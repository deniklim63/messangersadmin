-- AlterTable
ALTER TABLE "ScenarioBlock" ADD COLUMN     "nextWaypointX" INTEGER,
ADD COLUMN     "nextWaypointY" INTEGER;

-- AlterTable
ALTER TABLE "ScenarioButton" ADD COLUMN     "waypointX" INTEGER,
ADD COLUMN     "waypointY" INTEGER;
