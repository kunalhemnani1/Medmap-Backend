import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";

async function getSessionUser(req: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return session?.user ?? null;
}

const str = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

export async function listMyHospitals(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospitals = await prisma.registeredHospital.findMany({
            where: { ownerId: user.id },
            include: { _count: { select: { doctors: true, appointments: true, prices: true } } },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ hospitals });
    } catch (err) {
        console.error("listMyHospitals error:", err);
        return res.status(500).json({ error: "Failed to fetch hospitals" });
    }
}

export async function getPublicHospitals(req: Request, res: Response) {
    try {
        const { state, city, q, page: pageStr = "1", limit: limitStr = "20" } = req.query as Record<string, string>;
        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(50, parseInt(limitStr) || 20);
        const skip = (page - 1) * limit;
        const where: Record<string, unknown> = { isActive: true };
        if (state) where.state = { contains: state, mode: "insensitive" };
        if (city) where.city = { contains: city, mode: "insensitive" };
        if (q) where.name = { contains: q, mode: "insensitive" };
        const [hospitals, total] = await Promise.all([
            prisma.registeredHospital.findMany({
                where, skip, take: limit, orderBy: { createdAt: "desc" },
                include: {
                    doctors: { where: { isActive: true }, select: { id: true, name: true, specialty: true, consultationFee: true } },
                    prices: { where: { isActive: true }, select: { id: true, category: true, name: true, priceMin: true, priceMax: true } },
                    _count: { select: { reviews: true, appointments: true } },
                },
            }),
            prisma.registeredHospital.count({ where }),
        ]);
        return res.json({ hospitals, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error("getPublicHospitals error:", err);
        return res.status(500).json({ error: "Failed to fetch hospitals" });
    }
}

export async function getHospitalById(req: Request, res: Response) {
    try {
        const id = str(req.params.id);
        const hospital = await prisma.registeredHospital.findUnique({
            where: { id },
            include: {
                doctors: { where: { isActive: true } },
                prices: { where: { isActive: true } },
                reviews: {
                    orderBy: { createdAt: "desc" }, take: 20,
                    select: { id: true, rating: true, title: true, comment: true, authorName: true, visitDate: true, createdAt: true },
                },
            },
        });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });
        return res.json(hospital);
    } catch (err) {
        console.error("getHospitalById error:", err);
        return res.status(500).json({ error: "Failed to fetch hospital" });
    }
}

export async function createHospital(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { name, registrationNumber, type, address, city, state, pincode, latitude, longitude, phone, email, website, description } = req.body as Record<string, string>;
        if (!name || !address || !city || !state || !pincode || !phone || !email) {
            return res.status(400).json({ error: "Missing required fields: name, address, city, state, pincode, phone, email" });
        }
        const hospital = await prisma.registeredHospital.create({
            data: {
                ownerId: user.id, name, registrationNumber, type: type || "General",
                address, city, state, pincode,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                phone, email, website, description,
            },
        });
        return res.status(201).json(hospital);
    } catch (err) {
        console.error("createHospital error:", err);
        return res.status(500).json({ error: "Failed to register hospital" });
    }
}

export async function updateHospital(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const id = str(req.params.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const existing = await prisma.registeredHospital.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.ownerId !== user.id && (user as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
        const { name, registrationNumber, type, address, city, state, pincode, latitude, longitude, phone, email, website, description, isActive } = req.body as Record<string, string>;
        const updated = await prisma.registeredHospital.update({
            where: { id },
            data: { name, registrationNumber, type, address, city, state, pincode, latitude: latitude ? parseFloat(latitude) : undefined, longitude: longitude ? parseFloat(longitude) : undefined, phone, email, website, description, isActive: isActive !== undefined ? isActive === "true" : undefined },
        });
        return res.json(updated);
    } catch (err) {
        console.error("updateHospital error:", err);
        return res.status(500).json({ error: "Failed to update hospital" });
    }
}

export async function listDoctors(req: Request, res: Response) {
    try {
        const id = str(req.params.id);
        const doctors = await prisma.hospitalDoctor.findMany({ where: { hospitalId: id, isActive: true }, orderBy: { createdAt: "desc" } });
        return res.json({ doctors });
    } catch (err) {
        console.error("listDoctors error:", err);
        return res.status(500).json({ error: "Failed to fetch doctors" });
    }
}

export async function addDoctor(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const hospitalId = str(req.params.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });
        if (hospital.ownerId !== user.id && (user as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
        const { name, email, qualification, specialty, subSpecialty, experienceYears, consultationFee, availableDays, availableFrom, availableTo, maxSlotsPerDay, phone } = req.body as Record<string, string>;
        if (!name || !qualification || !specialty) {
            return res.status(400).json({ error: "Missing required: name, qualification, specialty" });
        }
        // Look up the user by email to link
        let userId: string | null = null;
        if (email) {
            const linkedUser = await prisma.user.findUnique({ where: { email } });
            if (linkedUser) userId = linkedUser.id;
        }
        const doctor = await prisma.hospitalDoctor.create({
            data: { hospitalId, name, email: email || null, userId, qualification, specialty, subSpecialty: subSpecialty || null, experienceYears: parseInt(experienceYears) || 0, consultationFee: parseInt(consultationFee) || 500, availableDays: availableDays || "Mon,Tue,Wed,Thu,Fri", availableFrom: availableFrom || "09:00", availableTo: availableTo || "17:00", maxSlotsPerDay: parseInt(maxSlotsPerDay) || 20, phone: phone || null, acceptedByDoctor: false },
        });
        return res.status(201).json(doctor);
    } catch (err) {
        console.error("addDoctor error:", err);
        return res.status(500).json({ error: "Failed to add doctor" });
    }
}

export async function removeDoctor(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const hospitalId = str(req.params.id);
        const doctorId = str(req.params.doctorId);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital || hospital.ownerId !== user.id) return res.status(403).json({ error: "Forbidden" });
        await prisma.hospitalDoctor.update({ where: { id: doctorId }, data: { isActive: false } });
        return res.json({ success: true });
    } catch (err) {
        console.error("removeDoctor error:", err);
        return res.status(500).json({ error: "Failed to remove doctor" });
    }
}

export async function listPrices(req: Request, res: Response) {
    try {
        const id = str(req.params.id);
        const prices = await prisma.hospitalPrice.findMany({ where: { hospitalId: id, isActive: true }, orderBy: { category: "asc" } });
        return res.json({ prices });
    } catch (err) {
        console.error("listPrices error:", err);
        return res.status(500).json({ error: "Failed to fetch prices" });
    }
}

export async function addPrice(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const hospitalId = str(req.params.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital || hospital.ownerId !== user.id) return res.status(403).json({ error: "Forbidden" });
        const { category, name, description, priceMin, priceMax } = req.body as Record<string, string>;
        if (!category || !name || !priceMin || !priceMax) {
            return res.status(400).json({ error: "Missing required: category, name, priceMin, priceMax" });
        }
        const price = await prisma.hospitalPrice.create({
            data: { hospitalId, category, name, description: description || null, priceMin: parseInt(priceMin), priceMax: parseInt(priceMax) },
        });
        return res.status(201).json(price);
    } catch (err) {
        console.error("addPrice error:", err);
        return res.status(500).json({ error: "Failed to add price" });
    }
}

export async function removePrice(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const hospitalId = str(req.params.id);
        const priceId = str(req.params.priceId);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital || hospital.ownerId !== user.id) return res.status(403).json({ error: "Forbidden" });
        await prisma.hospitalPrice.update({ where: { id: priceId }, data: { isActive: false } });
        return res.json({ success: true });
    } catch (err) {
        console.error("removePrice error:", err);
        return res.status(500).json({ error: "Failed to remove price" });
    }
}

export async function createAppointment(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        if ((user as any).role && (user as any).role !== "user") {
            return res.status(403).json({ error: "Only patients can book appointments" });
        }
        const { hospitalId, doctorId, patientName, patientPhone, patientEmail, procedure, appointmentDate, appointmentTime, notes } = req.body as Record<string, string>;
        if (!hospitalId || !patientName || !patientPhone || !patientEmail || !procedure || !appointmentDate || !appointmentTime) {
            return res.status(400).json({ error: "Missing required appointment fields" });
        }
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });

        let assignedDoctorId = doctorId || null;
        if (!assignedDoctorId) {
            const doctors = await prisma.hospitalDoctor.findMany({ where: { hospitalId, isActive: true } });
            if (doctors.length > 0) {
                const targetDate = new Date(appointmentDate);
                const counts = await Promise.all(
                    doctors.map(async (doc) => ({
                        id: doc.id, max: doc.maxSlotsPerDay,
                        count: await prisma.appointment.count({ where: { doctorId: doc.id, appointmentDate: targetDate, status: { not: "cancelled" } } }),
                    }))
                );
                const available = counts.filter(d => d.count < d.max).sort((a, b) => a.count - b.count);
                assignedDoctorId = available[0]?.id || null;
            }
        }

        const priceEntry = await prisma.hospitalPrice.findFirst({
            where: { hospitalId, isActive: true, name: { contains: procedure, mode: "insensitive" } },
        });

        const appointment = await prisma.appointment.create({
            data: { hospitalId, doctorId: assignedDoctorId, patientId: user.id, patientName, patientPhone, patientEmail, procedure, appointmentDate: new Date(appointmentDate), appointmentTime, notes: notes || null, estimatedCost: priceEntry ? priceEntry.priceMin : null, status: "confirmed" },
            include: { hospital: true, doctor: true },
        });
        return res.status(201).json(appointment);
    } catch (err) {
        console.error("createAppointment error:", err);
        return res.status(500).json({ error: "Failed to book appointment" });
    }
}

export async function listPatientAppointments(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const appointments = await prisma.appointment.findMany({
            where: { patientId: user.id },
            include: {
                hospital: { select: { id: true, name: true, city: true, state: true, phone: true } },
                doctor: { select: { id: true, name: true, specialty: true } },
            },
            orderBy: { appointmentDate: "desc" },
        });
        return res.json({ appointments });
    } catch (err) {
        console.error("listPatientAppointments error:", err);
        return res.status(500).json({ error: "Failed to fetch appointments" });
    }
}

export async function listHospitalAppointments(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const hospitalId = str(req.params.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital || hospital.ownerId !== user.id) return res.status(403).json({ error: "Forbidden" });
        const appointments = await prisma.appointment.findMany({
            where: { hospitalId },
            include: { doctor: { select: { id: true, name: true, specialty: true } } },
            orderBy: { appointmentDate: "desc" },
        });
        return res.json({ appointments });
    } catch (err) {
        console.error("listHospitalAppointments error:", err);
        return res.status(500).json({ error: "Failed to fetch appointments" });
    }
}

export async function updateAppointmentStatus(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        const appointmentId = str(req.params.appointmentId);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
        if (!appt) return res.status(404).json({ error: "Not found" });

        // Check ownership: patient can cancel their own; hospital owner can update any
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: appt.hospitalId } });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });
        if (hospital.ownerId !== user.id && appt.patientId !== user.id) return res.status(403).json({ error: "Forbidden" });

        const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
        const { status } = req.body as { status: string };
        if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

        const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { status } });

        // Generate review token when appointment is marked completed
        if (status === "completed") {
            const existingToken = await prisma.reviewToken.findUnique({ where: { appointmentId } });
            if (!existingToken) {
                const token = crypto.randomBytes(32).toString("hex");
                await prisma.reviewToken.create({
                    data: {
                        appointmentId,
                        patientId: appt.patientId,
                        hospitalId: appt.hospitalId,
                        token,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    },
                });
            }
        }

        return res.json(updated);
    } catch (err) {
        console.error("updateAppointmentStatus error:", err);
        return res.status(500).json({ error: "Failed to update appointment" });
    }
}

export async function createReview(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { hospitalId, ratingWaiting, ratingCommunication, ratingStaff, ratingCleanliness, ratingOverall, title, comment, visitDate, phone, reviewToken } = req.body as Record<string, string>;
        if (!hospitalId || !ratingOverall || !comment) {
            return res.status(400).json({ error: "Missing required: hospitalId, ratingOverall, comment" });
        }
        const rW = Math.min(5, Math.max(1, parseInt(ratingWaiting) || 3));
        const rC = Math.min(5, Math.max(1, parseInt(ratingCommunication) || 3));
        const rS = Math.min(5, Math.max(1, parseInt(ratingStaff) || 3));
        const rCl = Math.min(5, Math.max(1, parseInt(ratingCleanliness) || 3));
        const rO = Math.min(5, Math.max(1, parseInt(ratingOverall) || 3));
        const avgRating = Math.round((rW + rC + rS + rCl + rO) / 5);

        // Verify review token if provided
        let isVerifiedVisit = false;
        let appointmentId: string | null = null;
        if (reviewToken) {
            const token = await prisma.reviewToken.findUnique({ where: { token: reviewToken } });
            if (token && !token.used && token.patientId === user.id && token.hospitalId === hospitalId && new Date() < token.expiresAt) {
                isVerifiedVisit = true;
                appointmentId = token.appointmentId;
                await prisma.reviewToken.update({ where: { id: token.id }, data: { used: true } });
            }
        }

        // Fake detection: check for same IP/user-agent submitting multiple reviews recently
        const ip = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || null;
        const ua = req.headers["user-agent"] || null;
        let isFlagged = false;
        let flagReason: string | null = null;
        if (ip) {
            const recentFromIp = await prisma.hospitalReview.count({
                where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
            });
            if (recentFromIp >= 3) {
                isFlagged = true;
                flagReason = `Multiple reviews from same IP (${recentFromIp + 1} in last hour)`;
            }
        }
        // Also check same user posting to same hospital
        const existingUserReview = await prisma.hospitalReview.findFirst({
            where: { authorId: user.id, hospitalId },
        });
        if (existingUserReview) {
            return res.status(409).json({ error: "You have already reviewed this hospital" });
        }

        const review = await prisma.hospitalReview.create({
            data: {
                hospitalId, authorId: user.id, authorName: user.name, appointmentId,
                ratingWaiting: rW, ratingCommunication: rC, ratingStaff: rS, ratingCleanliness: rCl, ratingOverall: rO,
                rating: avgRating, title: title || null, comment, phone: phone || null,
                visitDate: visitDate ? new Date(visitDate) : null,
                isVerifiedVisit, reviewToken: reviewToken || null,
                ipAddress: ip, userAgent: ua, isFlagged, flagReason,
            },
        });
        return res.status(201).json(review);
    } catch (err) {
        console.error("createReview error:", err);
        return res.status(500).json({ error: "Failed to create review" });
    }
}

export async function listReviews(req: Request, res: Response) {
    try {
        const id = str(req.params.id);
        const reviews = await prisma.hospitalReview.findMany({ where: { hospitalId: id }, orderBy: { createdAt: "desc" }, take: 50 });
        const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
        return res.json({ reviews, average_rating: parseFloat(avg.toFixed(1)), total: reviews.length });
    } catch (err) {
        console.error("listReviews error:", err);
        return res.status(500).json({ error: "Failed to fetch reviews" });
    }
}

// ─── Doctor endpoint ──────────────────────────────────────────────────────────

export async function listDoctorAppointments(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const appointments = await prisma.appointment.findMany({
            where: { hospital: { ownerId: user.id } },
            include: {
                hospital: { select: { id: true, name: true, city: true } },
                doctor: { select: { id: true, name: true, specialty: true } },
            },
            orderBy: { appointmentDate: "desc" },
        });
        return res.json({ appointments });
    } catch (err) {
        console.error("listDoctorAppointments error:", err);
        return res.status(500).json({ error: "Failed to fetch appointments" });
    }
}

// ─── Admin endpoints ─────────────────────────────────────────────────────────
export async function adminListHospitals(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const { page: pageStr = "1", limit: limitStr = "30", verified } = req.query as Record<string, string>;
        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(100, parseInt(limitStr) || 30);
        const skip = (page - 1) * limit;
        const where: Record<string, unknown> = {};
        if (verified === "true") where.isVerified = true;
        if (verified === "false") where.isVerified = false;
        const [hospitals, total] = await Promise.all([
            prisma.registeredHospital.findMany({
                where, skip, take: limit, orderBy: { createdAt: "desc" },
                include: { _count: { select: { doctors: true, appointments: true } } },
            }),
            prisma.registeredHospital.count({ where }),
        ]);
        return res.json({ hospitals, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error("adminListHospitals error:", err);
        return res.status(500).json({ error: "Failed to fetch hospitals" });
    }
}

export async function adminVerifyHospital(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const id = str(req.params.id);
        const { isVerified, isActive } = req.body as { isVerified?: boolean; isActive?: boolean };
        const updated = await prisma.registeredHospital.update({
            where: { id },
            data: { isVerified: isVerified !== undefined ? isVerified : undefined, isActive: isActive !== undefined ? isActive : undefined },
        });
        return res.json(updated);
    } catch (err) {
        console.error("adminVerifyHospital error:", err);
        return res.status(500).json({ error: "Failed to update hospital" });
    }
}

export async function adminListAppointments(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const { page: pageStr = "1", limit: limitStr = "30" } = req.query as Record<string, string>;
        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(100, parseInt(limitStr) || 30);
        const skip = (page - 1) * limit;
        const [appointments, total] = await Promise.all([
            prisma.appointment.findMany({
                skip, take: limit, orderBy: { appointmentDate: "desc" },
                include: {
                    hospital: { select: { id: true, name: true, city: true } },
                    doctor: { select: { id: true, name: true, specialty: true } },
                },
            }),
            prisma.appointment.count(),
        ]);
        return res.json({ appointments, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error("adminListAppointments error:", err);
        return res.status(500).json({ error: "Failed to fetch appointments" });
    }
}

// ─── Doctor Registration Requests ────────────────────────────────────────────

export async function submitDoctorRequest(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { hospitalId, name, email, phone, qualification, specialty, medicalRegNo, documentUrl } = req.body as Record<string, string>;
        if (!hospitalId || !name || !email || !qualification || !specialty || !medicalRegNo) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const hospital = await prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });
        // Check duplicate
        const existing = await prisma.doctorRequest.findFirst({
            where: { requesterId: user.id, hospitalId, status: "pending" },
        });
        if (existing) return res.status(409).json({ error: "You already have a pending request for this hospital" });
        const request = await prisma.doctorRequest.create({
            data: { hospitalId, requesterId: user.id, name, email, phone: phone || null, qualification, specialty, medicalRegNo, documentUrl: documentUrl || null },
        });
        return res.status(201).json(request);
    } catch (err) {
        console.error("submitDoctorRequest error:", err);
        return res.status(500).json({ error: "Failed to submit request" });
    }
}

export async function adminListDoctorRequests(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const { status } = req.query as Record<string, string>;
        const where: Record<string, unknown> = {};
        if (status) where.status = status;
        const requests = await prisma.doctorRequest.findMany({
            where, orderBy: { createdAt: "desc" },
            include: {
                hospital: { select: { id: true, name: true, city: true, state: true } },
                requester: { select: { id: true, name: true, email: true } },
            },
        });
        return res.json({ requests });
    } catch (err) {
        console.error("adminListDoctorRequests error:", err);
        return res.status(500).json({ error: "Failed to fetch requests" });
    }
}

export async function adminDecideDoctorRequest(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const id = str(req.params.id);
        const { decision, adminNotes } = req.body as { decision: string; adminNotes?: string };
        if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Invalid decision" });
        const request = await prisma.doctorRequest.findUnique({ where: { id }, include: { requester: true } });
        if (!request) return res.status(404).json({ error: "Request not found" });
        const updated = await prisma.doctorRequest.update({ where: { id }, data: { status: decision, adminNotes: adminNotes || null } });
        // On approval, auto-create the HospitalDoctor entry (acceptedByDoctor=false, doctor must accept)
        if (decision === "approved") {
            await prisma.hospitalDoctor.create({
                data: {
                    hospitalId: request.hospitalId,
                    userId: request.requesterId,
                    name: request.name,
                    email: request.email,
                    qualification: request.qualification,
                    specialty: request.specialty,
                    phone: request.phone,
                    acceptedByDoctor: false,
                },
            });
        }
        return res.json(updated);
    } catch (err) {
        console.error("adminDecideDoctorRequest error:", err);
        return res.status(500).json({ error: "Failed to update request" });
    }
}

// ─── Doctor acceptance (3-way handshake) ────────────────────────────────────

export async function listMyDoctorInvites(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const invites = await prisma.hospitalDoctor.findMany({
            where: { userId: user.id, acceptedByDoctor: false, isActive: true },
            include: { hospital: { select: { id: true, name: true, city: true, state: true } } },
        });
        return res.json({ invites });
    } catch (err) {
        console.error("listMyDoctorInvites error:", err);
        return res.status(500).json({ error: "Failed to fetch invites" });
    }
}

export async function acceptDoctorInvite(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const id = str(req.params.doctorId);
        const doctor = await prisma.hospitalDoctor.findUnique({ where: { id } });
        if (!doctor || doctor.userId !== user.id) return res.status(403).json({ error: "Forbidden" });
        const { accept } = req.body as { accept: boolean };
        if (accept) {
            await prisma.hospitalDoctor.update({ where: { id }, data: { acceptedByDoctor: true } });
        } else {
            await prisma.hospitalDoctor.update({ where: { id }, data: { isActive: false } });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error("acceptDoctorInvite error:", err);
        return res.status(500).json({ error: "Failed to process invite" });
    }
}

// ─── Review Token lookup (patient checks if they have a token for a hospital) ─

export async function getReviewToken(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { hospitalId } = req.query as { hospitalId: string };
        if (!hospitalId) return res.status(400).json({ error: "hospitalId required" });
        const token = await prisma.reviewToken.findFirst({
            where: { patientId: user.id, hospitalId, used: false, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ token: token?.token || null, appointmentId: token?.appointmentId || null });
    } catch (err) {
        console.error("getReviewToken error:", err);
        return res.status(500).json({ error: "Failed to check review token" });
    }
}

// ─── Admin review management ────────────────────────────────────────────────

export async function adminListFlaggedReviews(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const reviews = await prisma.hospitalReview.findMany({
            where: { isFlagged: true },
            orderBy: { createdAt: "desc" },
            include: { hospital: { select: { name: true } } },
        });
        return res.json({ reviews });
    } catch (err) {
        console.error("adminListFlaggedReviews error:", err);
        return res.status(500).json({ error: "Failed to fetch flagged reviews" });
    }
}

export async function adminDeleteReview(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const id = str(req.params.id);
        await prisma.hospitalReview.delete({ where: { id } });
        return res.json({ success: true });
    } catch (err) {
        console.error("adminDeleteReview error:", err);
        return res.status(500).json({ error: "Failed to delete review" });
    }
}

export async function adminUnflagReview(req: Request, res: Response) {
    try {
        const user = await getSessionUser(req);
        if (!user || (user as any).role !== "admin") return res.status(403).json({ error: "Admin only" });
        const id = str(req.params.id);
        await prisma.hospitalReview.update({ where: { id }, data: { isFlagged: false, flagReason: null } });
        return res.json({ success: true });
    } catch (err) {
        console.error("adminUnflagReview error:", err);
        return res.status(500).json({ error: "Failed to unflag review" });
    }
}
