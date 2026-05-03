-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "anthropicKeyEnc" TEXT,
    "anthropicKeyIv" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_graphs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "graphJson" JSONB NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_graphs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" TEXT NOT NULL,
    "s2PaperId" TEXT NOT NULL,
    "arxivId" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "year" INTEGER,
    "authors" JSONB NOT NULL,
    "citationCount" INTEGER NOT NULL DEFAULT 0,
    "influentialCitationCount" INTEGER NOT NULL DEFAULT 0,
    "venue" TEXT,
    "fieldsOfStudy" JSONB,
    "externalIds" JSONB,
    "openAccessPdf" TEXT,
    "tldr" TEXT,
    "metadataJson" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "saved_graphs_userId_idx" ON "saved_graphs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "papers_s2PaperId_key" ON "papers"("s2PaperId");

-- CreateIndex
CREATE INDEX "papers_arxivId_idx" ON "papers"("arxivId");

-- CreateIndex
CREATE UNIQUE INDEX "summaries_paperId_key" ON "summaries"("paperId");

-- AddForeignKey
ALTER TABLE "saved_graphs" ADD CONSTRAINT "saved_graphs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
