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
export function getHospitalById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id))
                return res.status(400).json({ error: "Invalid hospital ID" });
            const redis = getRedis();
            const cacheKey = `hospital:${id}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("hospitals");
            const hospital = yield coll.findOne({ Sr_No: id });
            if (!hospital)
                return res.status(404).json({ error: "Hospital not found" });
            // Fetch related doctors and review stats
            const [doctors, reviewStats, pricing] = yield Promise.all([
                (yield getCollection("doctors")).find({ Hospital_Id: id }).toArray(),
                (yield getCollection("reviews")).aggregate([
                    { $match: { Hospital_Id: id } },
                    { $group: { _id: null, avg: { $avg: "$Rating" }, count: { $sum: 1 } } },
                ]).toArray(),
                (yield getCollection("pricing"))
                    .find({ Hospital_Id: id })
                    .project({ Procedure_Name: 1, Procedure_Category: 1, Price_INR: 1, _id: 0 })
                    .limit(20)
                    .toArray(),
            ]);
            const response = Object.assign(Object.assign({}, hospital), { _id: undefined, doctors: doctors.map((d) => ({
                    id: d.Doctor_Id,
                    name: d.Doctor_Name,
                    specialty: d.Specialty,
                    qualification: d.Qualification,
                    experience: d.Experience_Years,
                    fee: d.Consultation_Fee_INR,
                    rating: d.Rating,
                    available_days: d.Available_Days,
                    available_time: d.Available_Time,
                })), review_summary: {
                    average_rating: (_b = (_a = reviewStats[0]) === null || _a === void 0 ? void 0 : _a.avg) !== null && _b !== void 0 ? _b : 0,
                    total_reviews: (_d = (_c = reviewStats[0]) === null || _c === void 0 ? void 0 : _c.count) !== null && _d !== void 0 ? _d : 0,
                }, procedures: pricing });
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Hospital detail error:", err);
            return res.status(500).json({ error: "Failed to fetch hospital" });
        }
    });
}
export function getHospitalStats(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const redis = getRedis();
            const cached = yield redis.get("hospital:stats");
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("hospitals");
            const [totalResult, statesResult, districtsResult] = yield Promise.all([
                coll.countDocuments(),
                coll.distinct("State"),
                coll.distinct("District"),
            ]);
            const response = {
                total_hospitals: totalResult,
                total_states: statesResult.length,
                total_districts: districtsResult.length,
                states: statesResult.sort(),
            };
            yield redis.set("hospital:stats", JSON.stringify(response), { ex: 3600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Hospital stats error:", err);
            return res.status(500).json({ error: "Failed to fetch stats" });
        }
    });
}
export function compareHospitals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const idsParam = req.query.ids;
            if (!idsParam)
                return res.status(400).json({ error: "ids parameter required" });
            // Accept both HOSP00001 format and plain numeric Sr_No
            const ids = idsParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 5)
                .map((s) => (/^HOSP/i.test(s) ? parseInt(s.replace(/^HOSP0*/i, "") || "0", 10) : Number(s)))
                .filter((n) => !isNaN(n) && n > 0);
            if (!ids.length)
                return res.status(400).json({ error: "Invalid IDs" });
            const redis = getRedis();
            const cacheKey = `compare:${[...ids].sort((a, b) => a - b).join(",")}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const [hospitals, pricingAgg, reviewAgg] = yield Promise.all([
                (yield getCollection("hospitals")).find({ Sr_No: { $in: ids } }).toArray(),
                (yield getCollection("pricing")).aggregate([
                    { $match: { Hospital_Id: { $in: ids } } },
                    { $group: { _id: "$Hospital_Id", avg_price: { $avg: "$Price_INR" }, procedure_count: { $sum: 1 } } },
                ]).toArray(),
                (yield getCollection("reviews")).aggregate([
                    { $match: { Hospital_Id: { $in: ids } } },
                    { $group: { _id: "$Hospital_Id", avg_rating: { $avg: "$Rating" }, review_count: { $sum: 1 } } },
                ]).toArray(),
            ]);
            const pricingMap = Object.fromEntries(pricingAgg.map((p) => [p._id, p]));
            const reviewMap = Object.fromEntries(reviewAgg.map((r) => [r._id, r]));
            const response = {
                hospitals: hospitals.map((h) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    return ({
                        id: `HOSP${String(h.Sr_No).padStart(5, "0")}`,
                        name: h.Hospital_Name,
                        state: h.State,
                        district: h.District,
                        pincode: h.Pincode,
                        telephone: h.Telephone,
                        avg_price: Math.round((_b = (_a = pricingMap[h.Sr_No]) === null || _a === void 0 ? void 0 : _a.avg_price) !== null && _b !== void 0 ? _b : 0),
                        procedure_count: (_d = (_c = pricingMap[h.Sr_No]) === null || _c === void 0 ? void 0 : _c.procedure_count) !== null && _d !== void 0 ? _d : 0,
                        avg_rating: Number(((_f = (_e = reviewMap[h.Sr_No]) === null || _e === void 0 ? void 0 : _e.avg_rating) !== null && _f !== void 0 ? _f : 0).toFixed(1)),
                        review_count: (_h = (_g = reviewMap[h.Sr_No]) === null || _g === void 0 ? void 0 : _g.review_count) !== null && _h !== void 0 ? _h : 0,
                    });
                }),
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 300 });
            return res.json(response);
        }
        catch (err) {
            console.error("Compare error:", err);
            return res.status(500).json({ error: "Comparison failed" });
        }
    });
}
