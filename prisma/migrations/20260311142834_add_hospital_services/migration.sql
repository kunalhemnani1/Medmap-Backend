-- CreateTable
CREATE TABLE "registered_hospital" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "type" TEXT NOT NULL DEFAULT 'General',
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registered_hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_doctor" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "subSpecialty" TEXT,
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "consultationFee" INTEGER NOT NULL DEFAULT 500,
    "availableDays" TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    "availableFrom" TEXT NOT NULL DEFAULT '09:00',
    "availableTo" TEXT NOT NULL DEFAULT '17:00',
    "maxSlotsPerDay" INTEGER NOT NULL DEFAULT 20,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_price" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "doctorId" TEXT,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "patientEmail" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "appointmentTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "estimatedCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_review" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registered_hospital_ownerId_idx" ON "registered_hospital"("ownerId");

-- CreateIndex
CREATE INDEX "registered_hospital_state_city_idx" ON "registered_hospital"("state", "city");

-- CreateIndex
CREATE INDEX "hospital_doctor_hospitalId_idx" ON "hospital_doctor"("hospitalId");

-- CreateIndex
CREATE INDEX "hospital_price_hospitalId_idx" ON "hospital_price"("hospitalId");

-- CreateIndex
CREATE INDEX "appointment_hospitalId_idx" ON "appointment"("hospitalId");

-- CreateIndex
CREATE INDEX "appointment_patientId_idx" ON "appointment"("patientId");

-- CreateIndex
CREATE INDEX "appointment_doctorId_idx" ON "appointment"("doctorId");

-- CreateIndex
CREATE INDEX "hospital_review_hospitalId_idx" ON "hospital_review"("hospitalId");

-- CreateIndex
CREATE INDEX "hospital_review_authorId_idx" ON "hospital_review"("authorId");

-- AddForeignKey
ALTER TABLE "registered_hospital" ADD CONSTRAINT "registered_hospital_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_doctor" ADD CONSTRAINT "hospital_doctor_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "registered_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_price" ADD CONSTRAINT "hospital_price_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "registered_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "registered_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "hospital_doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_review" ADD CONSTRAINT "hospital_review_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "registered_hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_review" ADD CONSTRAINT "hospital_review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
