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
export function getReviews(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { hospital_id, rating, sort = "recent", page: pageStr = "1", limit: limitStr = "20", } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
            const skip = (page - 1) * limit;
            const filter = {};
            if (hospital_id)
                filter.Hospital_Id = parseInt(hospital_id, 10);
            if (rating)
                filter.Rating = { $gte: parseInt(rating, 10) };
            const sortObj = sort === "rating" ? { Rating: -1 } : { Review_Date: -1 };
            const coll = yield getCollection("reviews");
            const [results, total] = yield Promise.all([
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
        }
        catch (err) {
            console.error("Reviews error:", err);
            return res.status(500).json({ error: "Failed to fetch reviews" });
        }
    });
}
export function getReviewStats(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const redis = getRedis();
            const cached = yield redis.get("reviews:stats");
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("reviews");
            const [overall, distribution] = yield Promise.all([
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
            yield redis.set("reviews:stats", JSON.stringify(response), { ex: 600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Review stats error:", err);
            return res.status(500).json({ error: "Failed to fetch review stats" });
        }
    });
}
