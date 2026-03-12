var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";
export function getDoctors(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { hospital_id, specialty, state, q, sort = "rating", page: pageStr = "1", limit: limitStr = "20", } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
            const skip = (page - 1) * limit;
            const filter = {};
            if (hospital_id)
                filter.Hospital_Id = parseInt(hospital_id, 10);
            if (specialty)
                filter.Specialty = specialty;
            if (state)
                filter.State = state;
            if (q)
                filter.Doctor_Name = { $regex: q, $options: "i" };
            const sortObj = sort === "experience" ? { Experience_Years: -1 } :
                sort === "fee-asc" ? { Consultation_Fee_INR: 1 } :
                    sort === "fee-desc" ? { Consultation_Fee_INR: -1 } :
                        { Rating: -1 };
            const coll = yield getCollection("doctors");
            const [results, total] = yield Promise.all([
                coll.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
                coll.countDocuments(filter),
            ]);
            return res.json({
                results: results.map((d) => ({
                    id: d.Doctor_Id,
                    name: d.Doctor_Name,
                    qualification: d.Qualification,
                    specialty: d.Specialty,
                    sub_specialty: d.Sub_Specialty,
                    experience_years: d.Experience_Years,
                    hospital_id: d.Hospital_Id,
                    hospital_name: d.Hospital_Name,
                    state: d.State,
                    district: d.District,
                    consultation_fee: d.Consultation_Fee_INR,
                    rating: d.Rating,
                    total_reviews: d.Total_Reviews,
                    total_consultations: d.Total_Consultations,
                    languages: d.Languages_Known,
                    available_days: d.Available_Days,
                    available_time: d.Available_Time,
                    verified: d.Verified,
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            });
        }
        catch (err) {
            console.error("Doctors error:", err);
            return res.status(500).json({ error: "Failed to fetch doctors" });
        }
    });
}
export function getDoctorById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const redis = getRedis();
            const cacheKey = `doctor:${id}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("doctors");
            const doctor = yield coll.findOne({ Doctor_Id: id });
            if (!doctor)
                return res.status(404).json({ error: "Doctor not found" });
            const response = {
                id: doctor.Doctor_Id,
                name: doctor.Doctor_Name,
                qualification: doctor.Qualification,
                specialty: doctor.Specialty,
                sub_specialty: doctor.Sub_Specialty,
                experience_years: doctor.Experience_Years,
                hospital_id: doctor.Hospital_Id,
                hospital_name: doctor.Hospital_Name,
                state: doctor.State,
                district: doctor.District,
                consultation_fee: doctor.Consultation_Fee_INR,
                rating: doctor.Rating,
                total_reviews: doctor.Total_Reviews,
                total_consultations: doctor.Total_Consultations,
                languages: doctor.Languages_Known,
                available_days: doctor.Available_Days,
                available_time: doctor.Available_Time,
                email: doctor.Email,
                mobile: doctor.Mobile_Number,
                registration_number: doctor.Registration_Number,
                verified: doctor.Verified,
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Doctor detail error:", err);
            return res.status(500).json({ error: "Failed to fetch doctor" });
        }
    });
}
export function getSpecialties(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const redis = getRedis();
            const cached = yield redis.get("doctors:specialties");
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("doctors");
            const specialties = yield coll.aggregate([
                { $group: { _id: "$Specialty", count: { $sum: 1 }, avg_fee: { $avg: "$Consultation_Fee_INR" } } },
                { $sort: { count: -1 } },
            ]).toArray();
            const response = {
                specialties: specialties.map((s) => ({
                    name: s._id,
                    doctor_count: s.count,
                    avg_fee: Math.round(s.avg_fee),
                })),
            };
            yield redis.set("doctors:specialties", JSON.stringify(response), { ex: 3600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Specialties error:", err);
            return res.status(500).json({ error: "Failed to fetch specialties" });
        }
    });
}
