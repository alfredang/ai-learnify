-- AI provider swap (Anthropic → OpenAI primary / DeepSeek fallback):
-- the per-academy credential columns are provider-agnostic now.
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenCipher" TO "aiProviderTokenCipher";
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenIv" TO "aiProviderTokenIv";
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenTag" TO "aiProviderTokenTag";
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenLast4" TO "aiProviderTokenLast4";
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenSetAt" TO "aiProviderTokenSetAt";
ALTER TABLE "Academy" RENAME COLUMN "aiClaudeTokenSetBy" TO "aiProviderTokenSetBy";

-- Any stored Claude tokens are useless for OpenAI; clear them so the
-- chain falls through to the platform credential instead of failing.
UPDATE "Academy" SET
  "aiProviderTokenCipher" = NULL,
  "aiProviderTokenIv" = NULL,
  "aiProviderTokenTag" = NULL,
  "aiProviderTokenLast4" = NULL,
  "aiProviderTokenSetAt" = NULL,
  "aiProviderTokenSetBy" = NULL
WHERE "aiProviderTokenCipher" IS NOT NULL;

-- SCORM Studio capability
ALTER TYPE "AiCapability" ADD VALUE IF NOT EXISTS 'SCORM_DESIGN';

-- CreateEnum
CREATE TYPE "ScormBuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ScormBuildJob" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "sectionId" TEXT,
    "lectureId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audience" TEXT,
    "transcript" TEXT,
    "topicCount" INTEGER NOT NULL DEFAULT 4,
    "questionCount" INTEGER NOT NULL DEFAULT 5,
    "passMark" INTEGER NOT NULL DEFAULT 80,
    "status" "ScormBuildStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStep" TEXT,
    "stepsJson" JSONB,
    "errorMessage" TEXT,
    "videoFileName" TEXT,
    "videoBytes" INTEGER,
    "videoDurationSeconds" INTEGER,
    "videoUrl" TEXT,
    "designJson" JSONB,
    "packageUrl" TEXT,
    "entryPoint" TEXT DEFAULT 'index.html',
    "zipUrl" TEXT,
    "manifestIdentifier" TEXT,
    "validationJson" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScormBuildJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScormBuildJob_academyId_createdAt_idx" ON "ScormBuildJob"("academyId", "createdAt");
CREATE INDEX "ScormBuildJob_userId_idx" ON "ScormBuildJob"("userId");

-- AddForeignKey
ALTER TABLE "ScormBuildJob" ADD CONSTRAINT "ScormBuildJob_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScormBuildJob" ADD CONSTRAINT "ScormBuildJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
