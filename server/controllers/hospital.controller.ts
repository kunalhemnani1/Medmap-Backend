import { Request, Response } from "express";
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";

export async function getHospitalById(req: Request, res: Response) {
    try {
        // Accept both "HOSP00042" (from Elasticsearch) and plain "42"
        const raw = req.params.id as string;
        const numeric = raw.toUpperCase().startsWith("HOSP")
            ? raw.slice(4).replace(/^0+/, "") || "0"
            : raw;
        const id = parseInt(numeric, 10);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid hospital ID" });

        const redis = getRedis();
        const cacheKey = `hospital:${id}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("hospitals");
        const hospital = await coll.findOne({ Sr_No: id });
        if (!hospital) return res.status(404).json({ error: "Hospital not found" });

        // Fetch related doctors and review stats
        const [doctors, reviewStats, pricing] = await Promise.all([
            (await getCollection("doctors")).find({ Hospital_Id: id }).toArray(),
            (await getCollection("reviews")).aggregate([
                { $match: { Hospital_Id: id } },
                { $group: { _id: null, avg: { $avg: "$Rating" }, count: { $sum: 1 } } },
            ]).toArray(),
            (await getCollection("pricing"))
                .find({ Hospital_Id: id })
                .project({ Procedure_Name: 1, Procedure_Category: 1, Price_INR: 1, _id: 0 })
                .limit(20)
                .toArray(),
        ]);

        const response = {
            ...hospital,
            _id: undefined,
            doctors: doctors.map((d) => ({
                id: d.Doctor_Id,
                name: d.Doctor_Name,
                specialty: d.Specialty,
                qualification: d.Qualification,
                experience: d.Experience_Years,
                fee: d.Consultation_Fee_INR,
                rating: d.Rating,
                available_days: d.Available_Days,
                available_time: d.Available_Time,
            })),
            review_summary: {
                average_rating: reviewStats[0]?.avg ?? 0,
                total_reviews: reviewStats[0]?.count ?? 0,
            },
            procedures: pricing,
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
        return res.json(response);
    } catch (err) {
        console.error("Hospital detail error:", err);
        return res.status(500).json({ error: "Failed to fetch hospital" });
    }
}

export async function getHospitalStats(_req: Request, res: Response) {
    try {
        const redis = getRedis();
        const cached = await redis.get<string>("hospital:stats");
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("hospitals");
        const [totalResult, statesResult, districtsResult] = await Promise.all([
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

        await redis.set("hospital:stats", JSON.stringify(response), { ex: 3600 });
        return res.json(response);
    } catch (err) {
        console.error("Hospital stats error:", err);
        return res.status(500).json({ error: "Failed to fetch stats" });
    }
}

export async function compareHospitals(req: Request, res: Response) {
    try {
        const idsParam = req.query.ids as string;
        if (!idsParam) return res.status(400).json({ error: "ids parameter required" });

        // Accept both HOSP00001 format and plain numeric Sr_No
        const ids = idsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 5)
            .map((s) => (/^HOSP/i.test(s) ? parseInt(s.replace(/^HOSP0*/i, "") || "0", 10) : Number(s)))
            .filter((n) => !isNaN(n) && n > 0);
        if (!ids.length) return res.status(400).json({ error: "Invalid IDs" });

        const redis = getRedis();
        const cacheKey = `compare:${[...ids].sort((a, b) => a - b).join(",")}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const [hospitals, pricingAgg, reviewAgg] = await Promise.all([
            (await getCollection("hospitals")).find({ Sr_No: { $in: ids } }).toArray(),
            (await getCollection("pricing")).aggregate([
                { $match: { Hospital_Id: { $in: ids } } },
                { $group: { _id: "$Hospital_Id", avg_price: { $avg: "$Price_INR" }, procedure_count: { $sum: 1 } } },
            ]).toArray(),
            (await getCollection("reviews")).aggregate([
                { $match: { Hospital_Id: { $in: ids } } },
                { $group: { _id: "$Hospital_Id", avg_rating: { $avg: "$Rating" }, review_count: { $sum: 1 } } },
            ]).toArray(),
        ]);

        const pricingMap = Object.fromEntries(pricingAgg.map((p) => [p._id, p]));
        const reviewMap = Object.fromEntries(reviewAgg.map((r) => [r._id, r]));

        const response = {
            hospitals: hospitals.map((h) => ({
                id: `HOSP${String(h.Sr_No).padStart(5, "0")}`,
                name: h.Hospital_Name,
                state: h.State,
                district: h.District,
                pincode: h.Pincode,
                telephone: h.Telephone,
                avg_price: Math.round(pricingMap[h.Sr_No]?.avg_price ?? 0),
                procedure_count: pricingMap[h.Sr_No]?.procedure_count ?? 0,
                avg_rating: Number((reviewMap[h.Sr_No]?.avg_rating ?? 0).toFixed(1)),
                review_count: reviewMap[h.Sr_No]?.review_count ?? 0,
            })),
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 300 });
        return res.json(response);
    } catch (err) {
        console.error("Compare error:", err);
        return res.status(500).json({ error: "Comparison failed" });
    }
}
