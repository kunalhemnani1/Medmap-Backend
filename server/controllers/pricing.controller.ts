import { Request, Response } from "express";
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";

export async function searchPricing(req: Request, res: Response) {
    try {
        const {
            q,
            category,
            state,
            district,
            min_price,
            max_price,
            sort = "price-asc",
            page: pageStr = "1",
            limit: limitStr = "20",
        } = req.query as Record<string, string>;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 20));
        const skip = (page - 1) * limit;

        const redis = getRedis();
        const cacheKey = `pricing:${JSON.stringify(req.query)}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const filter: any = {};
        if (q) filter.$text = { $search: q };
        if (category) filter.Procedure_Category = category;
        if (state) filter.State = state;
        if (district) filter.District = district;
        if (min_price || max_price) {
            filter.Price_INR = {};
            if (min_price) filter.Price_INR.$gte = parseInt(min_price, 10);
            if (max_price) filter.Price_INR.$lte = parseInt(max_price, 10);
        }

        const sortObj: any = {};
        if (sort === "price-asc") sortObj.Price_INR = 1;
        else if (sort === "price-desc") sortObj.Price_INR = -1;
        else if (q) sortObj.score = { $meta: "textScore" };
        else sortObj.Price_INR = 1;

        const coll = await getCollection("pricing");
        const [results, total] = await Promise.all([
            coll.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
            coll.countDocuments(filter),
        ]);

        const response = {
            results: results.map((r) => ({
                hospital_id: r.Hospital_Id,
                hospital_name: r.Hospital_Name,
                hospital_type: r.Hospital_Type,
                state: r.State,
                district: r.District,
                city: r.City,
                procedure: r.Procedure_Name,
                category: r.Procedure_Category,
                price: r.Price_INR,
                duration_minutes: r.Duration_Minutes,
                includes_consultation: r.Includes_Consultation,
                includes_medicines: r.Includes_Medicines,
                insurance_accepted: r.Insurance_Accepted,
                cashless: r.Cashless_Available,
                room_type: r.Room_Type,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 300 });
        return res.json(response);
    } catch (err) {
        console.error("Pricing search error:", err);
        return res.status(500).json({ error: "Failed to search pricing" });
    }
}

export async function getCategories(_req: Request, res: Response) {
    try {
        const redis = getRedis();
        const cached = await redis.get<string>("pricing:categories");
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("pricing");
        const categories = await coll.aggregate([
            { $group: { _id: "$Procedure_Category", count: { $sum: 1 }, avg_price: { $avg: "$Price_INR" } } },
            { $sort: { count: -1 } },
        ]).toArray();

        const response = {
            categories: categories.map((c) => ({
                name: c._id,
                count: c.count,
                avg_price: Math.round(c.avg_price),
            })),
        };

        await redis.set("pricing:categories", JSON.stringify(response), { ex: 3600 });
        return res.json(response);
    } catch (err) {
        console.error("Categories error:", err);
        return res.status(500).json({ error: "Failed to fetch categories" });
    }
}

export async function estimatePrice(req: Request, res: Response) {
    try {
        const { procedure, state, city } = req.query as Record<string, string>;
        if (!procedure) return res.status(400).json({ error: "procedure parameter required" });

        const redis = getRedis();
        const cacheKey = `estimate:${procedure}:${state || ""}:${city || ""}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const filter: any = { Procedure_Name: { $regex: procedure, $options: "i" } };
        if (state) filter.State = state;
        if (city) filter.City = { $regex: city, $options: "i" };

        const coll = await getCollection("pricing");
        const stats = await coll.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    avg_price: { $avg: "$Price_INR" },
                    min_price: { $min: "$Price_INR" },
                    max_price: { $max: "$Price_INR" },
                    count: { $sum: 1 },
                },
            },
        ]).toArray();

        const byType = await coll.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$Hospital_Type",
                    avg_price: { $avg: "$Price_INR" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { avg_price: 1 } },
        ]).toArray();

        const cheapest = await coll.find(filter).sort({ Price_INR: 1 }).limit(5).toArray();

        const s = stats[0] || { avg_price: 0, min_price: 0, max_price: 0, count: 0 };
        const response = {
            procedure,
            state: state || "All India",
            city: city || "All Cities",
            avg_price: Math.round(s.avg_price),
            min_price: s.min_price,
            max_price: s.max_price,
            sample_count: s.count,
            by_hospital_type: byType.map((b) => ({
                type: b._id,
                avg_price: Math.round(b.avg_price),
                count: b.count,
            })),
            cheapest_options: cheapest.map((c) => ({
                hospital_name: c.Hospital_Name,
                hospital_id: c.Hospital_Id,
                price: c.Price_INR,
                city: c.City,
                state: c.State,
            })),
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
        return res.json(response);
    } catch (err) {
        console.error("Estimate error:", err);
        return res.status(500).json({ error: "Estimation failed" });
    }
}

export async function comparePrices(req: Request, res: Response) {
    try {
        const { procedure, hospital_ids } = req.query as Record<string, string>;
        if (!procedure) return res.status(400).json({ error: "procedure required" });

        const filter: any = { Procedure_Name: { $regex: procedure, $options: "i" } };
        if (hospital_ids) {
            const ids = hospital_ids.split(",").map(Number).filter((n) => !isNaN(n));
            if (ids.length) filter.Hospital_Id = { $in: ids };
        }

        const coll = await getCollection("pricing");
        const results = await coll.find(filter).sort({ Price_INR: 1 }).limit(20).toArray();

        return res.json({
            procedure,
            comparisons: results.map((r) => ({
                hospital_id: r.Hospital_Id,
                hospital_name: r.Hospital_Name,
                hospital_type: r.Hospital_Type,
                price: r.Price_INR,
                city: r.City,
                state: r.State,
                insurance_accepted: r.Insurance_Accepted,
                cashless: r.Cashless_Available,
            })),
        });
    } catch (err) {
        console.error("Compare prices error:", err);
        return res.status(500).json({ error: "Price comparison failed" });
    }
}
