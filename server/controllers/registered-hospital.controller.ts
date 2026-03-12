import { Request, Response } from "express";
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
        if (hospital.ownerId !== user.id) return res.status(403).json({ error: "Forbidden" });
        const { name, qualification, specialty, subSpecialty, experienceYears, consultationFee, availableDays, availableFrom, availableTo, maxSlotsPerDay, phone } = req.body as Record<string, string>;
        if (!name || !qualification || !specialty) {
            return res.status(400).json({ error: "Missing required: name, qualification, specialty" });
        }
        const doctor = await prisma.hospitalDoctor.create({
            data: { hospitalId, name, qualification, specialty, subSpecialty: subSpecialty || null, experienceYears: parseInt(experienceYears) || 0, consultationFee: parseInt(consultationFee) || 500, availableDays: availableDays || "Mon,Tue,Wed,Thu,Fri", availableFrom: availableFrom || "09:00", availableTo: availableTo || "17:00", maxSlotsPerDay: parseInt(maxSlotsPerDay) || 20, phone: phone || null },
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
        const { hospitalId, rating, title, comment, visitDate } = req.body as Record<string, string>;
        if (!hospitalId || !rating || !comment) {
            return res.status(400).json({ error: "Missing required: hospitalId, rating, comment" });
        }
        const ratingNum = parseInt(rating);
        if (ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: "Rating must be 1-5" });
        const review = await prisma.hospitalReview.create({
            data: { hospitalId, authorId: user.id, authorName: user.name, rating: ratingNum, title: title || null, comment, visitDate: visitDate ? new Date(visitDate) : null },
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
