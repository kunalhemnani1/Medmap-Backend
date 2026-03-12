var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import prisma from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
function getSessionUser(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        return (_a = session === null || session === void 0 ? void 0 : session.user) !== null && _a !== void 0 ? _a : null;
    });
}
const str = (v) => (Array.isArray(v) ? v[0] : v);
export function listMyHospitals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospitals = yield prisma.registeredHospital.findMany({
                where: { ownerId: user.id },
                include: { _count: { select: { doctors: true, appointments: true, prices: true } } },
                orderBy: { createdAt: "desc" },
            });
            return res.json({ hospitals });
        }
        catch (err) {
            console.error("listMyHospitals error:", err);
            return res.status(500).json({ error: "Failed to fetch hospitals" });
        }
    });
}
export function getPublicHospitals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { state, city, q, page: pageStr = "1", limit: limitStr = "20" } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, parseInt(limitStr) || 20);
            const skip = (page - 1) * limit;
            const where = { isActive: true };
            if (state)
                where.state = { contains: state, mode: "insensitive" };
            if (city)
                where.city = { contains: city, mode: "insensitive" };
            if (q)
                where.name = { contains: q, mode: "insensitive" };
            const [hospitals, total] = yield Promise.all([
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
        }
        catch (err) {
            console.error("getPublicHospitals error:", err);
            return res.status(500).json({ error: "Failed to fetch hospitals" });
        }
    });
}
export function getHospitalById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = str(req.params.id);
            const hospital = yield prisma.registeredHospital.findUnique({
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
            if (!hospital)
                return res.status(404).json({ error: "Hospital not found" });
            return res.json(hospital);
        }
        catch (err) {
            console.error("getHospitalById error:", err);
            return res.status(500).json({ error: "Failed to fetch hospital" });
        }
    });
}
export function createHospital(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const { name, registrationNumber, type, address, city, state, pincode, latitude, longitude, phone, email, website, description } = req.body;
            if (!name || !address || !city || !state || !pincode || !phone || !email) {
                return res.status(400).json({ error: "Missing required fields: name, address, city, state, pincode, phone, email" });
            }
            const hospital = yield prisma.registeredHospital.create({
                data: {
                    ownerId: user.id, name, registrationNumber, type: type || "General",
                    address, city, state, pincode,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    phone, email, website, description,
                },
            });
            return res.status(201).json(hospital);
        }
        catch (err) {
            console.error("createHospital error:", err);
            return res.status(500).json({ error: "Failed to register hospital" });
        }
    });
}
export function updateHospital(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const id = str(req.params.id);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const existing = yield prisma.registeredHospital.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ error: "Not found" });
            if (existing.ownerId !== user.id && user.role !== "admin")
                return res.status(403).json({ error: "Forbidden" });
            const { name, registrationNumber, type, address, city, state, pincode, latitude, longitude, phone, email, website, description, isActive } = req.body;
            const updated = yield prisma.registeredHospital.update({
                where: { id },
                data: { name, registrationNumber, type, address, city, state, pincode, latitude: latitude ? parseFloat(latitude) : undefined, longitude: longitude ? parseFloat(longitude) : undefined, phone, email, website, description, isActive: isActive !== undefined ? isActive === "true" : undefined },
            });
            return res.json(updated);
        }
        catch (err) {
            console.error("updateHospital error:", err);
            return res.status(500).json({ error: "Failed to update hospital" });
        }
    });
}
export function listDoctors(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = str(req.params.id);
            const doctors = yield prisma.hospitalDoctor.findMany({ where: { hospitalId: id, isActive: true }, orderBy: { createdAt: "desc" } });
            return res.json({ doctors });
        }
        catch (err) {
            console.error("listDoctors error:", err);
            return res.status(500).json({ error: "Failed to fetch doctors" });
        }
    });
}
export function addDoctor(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const hospitalId = str(req.params.id);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital)
                return res.status(404).json({ error: "Hospital not found" });
            if (hospital.ownerId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            const { name, qualification, specialty, subSpecialty, experienceYears, consultationFee, availableDays, availableFrom, availableTo, maxSlotsPerDay, phone } = req.body;
            if (!name || !qualification || !specialty) {
                return res.status(400).json({ error: "Missing required: name, qualification, specialty" });
            }
            const doctor = yield prisma.hospitalDoctor.create({
                data: { hospitalId, name, qualification, specialty, subSpecialty: subSpecialty || null, experienceYears: parseInt(experienceYears) || 0, consultationFee: parseInt(consultationFee) || 500, availableDays: availableDays || "Mon,Tue,Wed,Thu,Fri", availableFrom: availableFrom || "09:00", availableTo: availableTo || "17:00", maxSlotsPerDay: parseInt(maxSlotsPerDay) || 20, phone: phone || null },
            });
            return res.status(201).json(doctor);
        }
        catch (err) {
            console.error("addDoctor error:", err);
            return res.status(500).json({ error: "Failed to add doctor" });
        }
    });
}
export function removeDoctor(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const hospitalId = str(req.params.id);
            const doctorId = str(req.params.doctorId);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital || hospital.ownerId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            yield prisma.hospitalDoctor.update({ where: { id: doctorId }, data: { isActive: false } });
            return res.json({ success: true });
        }
        catch (err) {
            console.error("removeDoctor error:", err);
            return res.status(500).json({ error: "Failed to remove doctor" });
        }
    });
}
export function listPrices(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = str(req.params.id);
            const prices = yield prisma.hospitalPrice.findMany({ where: { hospitalId: id, isActive: true }, orderBy: { category: "asc" } });
            return res.json({ prices });
        }
        catch (err) {
            console.error("listPrices error:", err);
            return res.status(500).json({ error: "Failed to fetch prices" });
        }
    });
}
export function addPrice(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const hospitalId = str(req.params.id);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital || hospital.ownerId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            const { category, name, description, priceMin, priceMax } = req.body;
            if (!category || !name || !priceMin || !priceMax) {
                return res.status(400).json({ error: "Missing required: category, name, priceMin, priceMax" });
            }
            const price = yield prisma.hospitalPrice.create({
                data: { hospitalId, category, name, description: description || null, priceMin: parseInt(priceMin), priceMax: parseInt(priceMax) },
            });
            return res.status(201).json(price);
        }
        catch (err) {
            console.error("addPrice error:", err);
            return res.status(500).json({ error: "Failed to add price" });
        }
    });
}
export function removePrice(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const hospitalId = str(req.params.id);
            const priceId = str(req.params.priceId);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital || hospital.ownerId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            yield prisma.hospitalPrice.update({ where: { id: priceId }, data: { isActive: false } });
            return res.json({ success: true });
        }
        catch (err) {
            console.error("removePrice error:", err);
            return res.status(500).json({ error: "Failed to remove price" });
        }
    });
}
export function createAppointment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            if (user.role && user.role !== "user") {
                return res.status(403).json({ error: "Only patients can book appointments" });
            }
            const { hospitalId, doctorId, patientName, patientPhone, patientEmail, procedure, appointmentDate, appointmentTime, notes } = req.body;
            if (!hospitalId || !patientName || !patientPhone || !patientEmail || !procedure || !appointmentDate || !appointmentTime) {
                return res.status(400).json({ error: "Missing required appointment fields" });
            }
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital)
                return res.status(404).json({ error: "Hospital not found" });
            let assignedDoctorId = doctorId || null;
            if (!assignedDoctorId) {
                const doctors = yield prisma.hospitalDoctor.findMany({ where: { hospitalId, isActive: true } });
                if (doctors.length > 0) {
                    const targetDate = new Date(appointmentDate);
                    const counts = yield Promise.all(doctors.map((doc) => __awaiter(this, void 0, void 0, function* () {
                        return ({
                            id: doc.id, max: doc.maxSlotsPerDay,
                            count: yield prisma.appointment.count({ where: { doctorId: doc.id, appointmentDate: targetDate, status: { not: "cancelled" } } }),
                        });
                    })));
                    const available = counts.filter(d => d.count < d.max).sort((a, b) => a.count - b.count);
                    assignedDoctorId = ((_a = available[0]) === null || _a === void 0 ? void 0 : _a.id) || null;
                }
            }
            const priceEntry = yield prisma.hospitalPrice.findFirst({
                where: { hospitalId, isActive: true, name: { contains: procedure, mode: "insensitive" } },
            });
            const appointment = yield prisma.appointment.create({
                data: { hospitalId, doctorId: assignedDoctorId, patientId: user.id, patientName, patientPhone, patientEmail, procedure, appointmentDate: new Date(appointmentDate), appointmentTime, notes: notes || null, estimatedCost: priceEntry ? priceEntry.priceMin : null, status: "confirmed" },
                include: { hospital: true, doctor: true },
            });
            return res.status(201).json(appointment);
        }
        catch (err) {
            console.error("createAppointment error:", err);
            return res.status(500).json({ error: "Failed to book appointment" });
        }
    });
}
export function listPatientAppointments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const appointments = yield prisma.appointment.findMany({
                where: { patientId: user.id },
                include: {
                    hospital: { select: { id: true, name: true, city: true, state: true, phone: true } },
                    doctor: { select: { id: true, name: true, specialty: true } },
                },
                orderBy: { appointmentDate: "desc" },
            });
            return res.json({ appointments });
        }
        catch (err) {
            console.error("listPatientAppointments error:", err);
            return res.status(500).json({ error: "Failed to fetch appointments" });
        }
    });
}
export function listHospitalAppointments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const hospitalId = str(req.params.id);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: hospitalId } });
            if (!hospital || hospital.ownerId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            const appointments = yield prisma.appointment.findMany({
                where: { hospitalId },
                include: { doctor: { select: { id: true, name: true, specialty: true } } },
                orderBy: { appointmentDate: "desc" },
            });
            return res.json({ appointments });
        }
        catch (err) {
            console.error("listHospitalAppointments error:", err);
            return res.status(500).json({ error: "Failed to fetch appointments" });
        }
    });
}
export function updateAppointmentStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            const appointmentId = str(req.params.appointmentId);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const appt = yield prisma.appointment.findUnique({ where: { id: appointmentId } });
            if (!appt)
                return res.status(404).json({ error: "Not found" });
            // Check ownership: patient can cancel their own; hospital owner can update any
            const hospital = yield prisma.registeredHospital.findUnique({ where: { id: appt.hospitalId } });
            if (!hospital)
                return res.status(404).json({ error: "Hospital not found" });
            if (hospital.ownerId !== user.id && appt.patientId !== user.id)
                return res.status(403).json({ error: "Forbidden" });
            const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
            const { status } = req.body;
            if (!validStatuses.includes(status))
                return res.status(400).json({ error: "Invalid status" });
            const updated = yield prisma.appointment.update({ where: { id: appointmentId }, data: { status } });
            return res.json(updated);
        }
        catch (err) {
            console.error("updateAppointmentStatus error:", err);
            return res.status(500).json({ error: "Failed to update appointment" });
        }
    });
}
export function createReview(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const { hospitalId, rating, title, comment, visitDate } = req.body;
            if (!hospitalId || !rating || !comment) {
                return res.status(400).json({ error: "Missing required: hospitalId, rating, comment" });
            }
            const ratingNum = parseInt(rating);
            if (ratingNum < 1 || ratingNum > 5)
                return res.status(400).json({ error: "Rating must be 1-5" });
            const review = yield prisma.hospitalReview.create({
                data: { hospitalId, authorId: user.id, authorName: user.name, rating: ratingNum, title: title || null, comment, visitDate: visitDate ? new Date(visitDate) : null },
            });
            return res.status(201).json(review);
        }
        catch (err) {
            console.error("createReview error:", err);
            return res.status(500).json({ error: "Failed to create review" });
        }
    });
}
export function listReviews(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = str(req.params.id);
            const reviews = yield prisma.hospitalReview.findMany({ where: { hospitalId: id }, orderBy: { createdAt: "desc" }, take: 50 });
            const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
            return res.json({ reviews, average_rating: parseFloat(avg.toFixed(1)), total: reviews.length });
        }
        catch (err) {
            console.error("listReviews error:", err);
            return res.status(500).json({ error: "Failed to fetch reviews" });
        }
    });
}
// ─── Doctor endpoint ──────────────────────────────────────────────────────────
export function listDoctorAppointments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            const appointments = yield prisma.appointment.findMany({
                where: { hospital: { ownerId: user.id } },
                include: {
                    hospital: { select: { id: true, name: true, city: true } },
                    doctor: { select: { id: true, name: true, specialty: true } },
                },
                orderBy: { appointmentDate: "desc" },
            });
            return res.json({ appointments });
        }
        catch (err) {
            console.error("listDoctorAppointments error:", err);
            return res.status(500).json({ error: "Failed to fetch appointments" });
        }
    });
}
// ─── Admin endpoints ─────────────────────────────────────────────────────────
export function adminListHospitals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user || user.role !== "admin")
                return res.status(403).json({ error: "Admin only" });
            const { page: pageStr = "1", limit: limitStr = "30", verified } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(100, parseInt(limitStr) || 30);
            const skip = (page - 1) * limit;
            const where = {};
            if (verified === "true")
                where.isVerified = true;
            if (verified === "false")
                where.isVerified = false;
            const [hospitals, total] = yield Promise.all([
                prisma.registeredHospital.findMany({
                    where, skip, take: limit, orderBy: { createdAt: "desc" },
                    include: { _count: { select: { doctors: true, appointments: true } } },
                }),
                prisma.registeredHospital.count({ where }),
            ]);
            return res.json({ hospitals, total, page, limit, totalPages: Math.ceil(total / limit) });
        }
        catch (err) {
            console.error("adminListHospitals error:", err);
            return res.status(500).json({ error: "Failed to fetch hospitals" });
        }
    });
}
export function adminVerifyHospital(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user || user.role !== "admin")
                return res.status(403).json({ error: "Admin only" });
            const id = str(req.params.id);
            const { isVerified, isActive } = req.body;
            const updated = yield prisma.registeredHospital.update({
                where: { id },
                data: { isVerified: isVerified !== undefined ? isVerified : undefined, isActive: isActive !== undefined ? isActive : undefined },
            });
            return res.json(updated);
        }
        catch (err) {
            console.error("adminVerifyHospital error:", err);
            return res.status(500).json({ error: "Failed to update hospital" });
        }
    });
}
export function adminListAppointments(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield getSessionUser(req);
            if (!user || user.role !== "admin")
                return res.status(403).json({ error: "Admin only" });
            const { page: pageStr = "1", limit: limitStr = "30" } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(100, parseInt(limitStr) || 30);
            const skip = (page - 1) * limit;
            const [appointments, total] = yield Promise.all([
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
        }
        catch (err) {
            console.error("adminListAppointments error:", err);
            return res.status(500).json({ error: "Failed to fetch appointments" });
        }
    });
}
