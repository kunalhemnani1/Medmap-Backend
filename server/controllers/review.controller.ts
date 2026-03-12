import { Request, Response } from "express";
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";

export async function getReviews(req: Request, res: Response) {
    try {
        const {
            hospital_id,
            rating,
            sort = "recent",
            page: pageStr = "1",
            limit: limitStr = "20",
        } = req.query as Record<string, string>;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
        const skip = (page - 1) * limit;

        const filter: any = {};
        if (hospital_id) {
            const raw = hospital_id.toUpperCase().startsWith("HOSP")
                ? hospital_id.slice(4).replace(/^0+/, "") || "0"
                : hospital_id;
            filter.Hospital_Id = parseInt(raw, 10);
        }
        if (rating) filter.Rating = { $gte: parseInt(rating, 10) };

        const sortObj: any = sort === "rating" ? { Rating: -1 } : { Review_Date: -1 };

        const coll = await getCollection("reviews");
        const [results, total] = await Promise.all([
            coll.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
            coll.countDocuments(filter),
        ]);

        return res.json({
            results: results.map((r) => ({
                id: r.Review_Id,
                hospital_id: r.Hospital_Id,
                hospital_name: r.Hospital_Name,
                state: r.State,
                district: r.District,
                user_name: r.User_Name,
                rating: r.Rating,
                title: r.Review_Title,
                comment: r.Review_Comment,
                helpful_count: r.Helpful_Count,
                verified_patient: r.Verified_Patient,
                visit_date: r.Visit_Date,
                review_date: r.Review_Date,
                hospital_response: r.Hospital_Response,
                response_date: r.Response_Date,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error("Reviews error:", err);
        return res.status(500).json({ error: "Failed to fetch reviews" });
    }
}

export async function getReviewStats(_req: Request, res: Response) {
    try {
        const redis = getRedis();
        const cached = await redis.get<string>("reviews:stats");
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("reviews");
        const [overall, distribution] = await Promise.all([
            coll.aggregate([
                {
                    $group: {
                        _id: null,
                        avg_rating: { $avg: "$Rating" },
                        total: { $sum: 1 },
                        verified: { $sum: { $cond: ["$Verified_Patient", 1, 0] } },
                    },
                },
            ]).toArray(),
            coll.aggregate([
                { $group: { _id: "$Rating", count: { $sum: 1 } } },
                { $sort: { _id: -1 } },
            ]).toArray(),
        ]);

        const o = overall[0] || { avg_rating: 0, total: 0, verified: 0 };
        const response = {
            average_rating: Number(o.avg_rating.toFixed(1)),
            total_reviews: o.total,
            verified_reviews: o.verified,
            distribution: distribution.map((d) => ({ rating: d._id, count: d.count })),
        };

        await redis.set("reviews:stats", JSON.stringify(response), { ex: 600 });
        return res.json(response);
    } catch (err) {
        console.error("Review stats error:", err);
        return res.status(500).json({ error: "Failed to fetch review stats" });
    }
}
