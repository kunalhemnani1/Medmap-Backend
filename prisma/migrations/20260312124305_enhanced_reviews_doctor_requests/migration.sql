-- AlterTable
ALTER TABLE "hospital_doctor" ADD COLUMN     "acceptedByDoctor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "hospital_review" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerifiedVisit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "ratingCleanliness" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ratingCommunication" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ratingOverall" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ratingStaff" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "ratingWaiting" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reviewToken" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "doctor_request" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "qualification" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "medicalRegNo" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_token" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_request_hospitalId_idx" ON "doctor_request"("hospitalId");

-- CreateIndex
CREATE INDEX "doctor_request_requesterId_idx" ON "doctor_request"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "review_token_appointmentId_key" ON "review_token"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "review_token_token_key" ON "review_token"("token");

-- CreateIndex
CREATE INDEX "review_token_token_idx" ON "review_token"("token");

-- CreateIndex
CREATE INDEX "review_token_patientId_idx" ON "review_token"("patientId");

-- CreateIndex
CREATE INDEX "hospital_doctor_userId_idx" ON "hospital_doctor"("userId");

-- CreateIndex
CREATE INDEX "hospital_review_appointmentId_idx" ON "hospital_review"("appointmentId");

-- AddForeignKey
ALTER TABLE "hospital_doctor" ADD CONSTRAINT "hospital_doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_request" ADD CONSTRAINT "doctor_request_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "registered_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_request" ADD CONSTRAINT "doctor_request_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
