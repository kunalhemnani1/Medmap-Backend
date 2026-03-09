import { Request, Response } from "express";
import { getHospitalCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";
import crypto from "crypto";

interface SearchQuery {
    q?: string;
    state?: string;
    district?: string;
    pincode?: string;
    page?: string;
    limit?: string;
    sort?: string;
    // Filters
    priceMin?: string;
    priceMax?: string;
    categories?: string;
    rating?: string;
    insurance?: string;
    availability?: string;
    accreditation?: string;
    distance?: string;
    lat?: string;
    lon?: string;
}

const CACHE_TTL = 300; // 5 minutes

function buildCacheKey(query: SearchQuery): string {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    return `search:${hash}`;
}

export async function searchHospitals(req: Request, res: Response) {
    try {
        const {
            q,
            state,
            district,
            pincode,
            page: pageStr = "1",
            limit: limitStr = "12",
            sort = "relevance",
        } = req.query as SearchQuery;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 12));
        const skip = (page - 1) * limit;

        // Check Redis cache
        const redis = getRedis();
        const cacheKey = buildCacheKey(req.query as SearchQuery);

        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
            return res.json(parsed);
        }

        const collection = await getHospitalCollection();

        // Build MongoDB filter
        const mongoFilter: Record<string, any> = {};

        if (q && q.trim()) {
            // Use $text search if index is available, fall back to $regex across key fields
            mongoFilter.$or = [
                { Hospital_Name: { $regex: q.trim(), $options: "i" } },
                { Location: { $regex: q.trim(), $options: "i" } },
                { Address_Original_First_Line: { $regex: q.trim(), $options: "i" } },
                { State: { $regex: q.trim(), $options: "i" } },
                { District: { $regex: q.trim(), $options: "i" } },
            ];
        }

        if (state) {
            mongoFilter.State = { $regex: `^${state}$`, $options: "i" };
        }
        if (district) {
            mongoFilter.District = { $regex: `^${district}$`, $options: "i" };
        }
        if (pincode) {
            const pin = parseInt(pincode, 10);
            if (!isNaN(pin)) mongoFilter.Pincode = pin;
        }

        // Build sort
        const mongoSort: Record<string, 1 | -1> = {};
        switch (sort) {
            case "name-asc":
                mongoSort.Hospital_Name = 1;
                break;
            case "name-desc":
                mongoSort.Hospital_Name = -1;
                break;
            default:
                // relevance: sort by name ascending as default stable sort
                mongoSort.Sr_No = 1;
                break;
        }

        const [results, total] = await Promise.all([
            collection.find(mongoFilter).sort(mongoSort).skip(skip).limit(limit).toArray(),
            collection.countDocuments(mongoFilter),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        // Facet aggregations (distinct states and districts matching the current filter)
        const facetFilter: Record<string, any> = {};
        if (state) facetFilter.State = mongoFilter.State;
        if (district) facetFilter.District = mongoFilter.District;

        const [stateAgg, districtAgg] = await Promise.all([
            collection
                .aggregate([
                    { $group: { _id: "$State", count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                    { $limit: 50 },
                ])
                .toArray(),
            collection
                .aggregate([
                    ...(state ? [{ $match: { State: mongoFilter.State } }] : []),
                    { $group: { _id: "$District", count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                    { $limit: 200 },
                ])
                .toArray(),
        ]);

        const facets = {
            states: stateAgg
                .filter((b) => b._id)
                .map((b) => ({ value: b._id as string, count: b.count as number })),
            districts: districtAgg
                .filter((b) => b._id)
                .map((b) => ({ value: b._id as string, count: b.count as number })),
        };

        // Strip MongoDB _id from results
        const sanitized = results.map(({ _id, ...rest }) => rest);

        const response = {
            results: sanitized,
            total,
            page,
            limit,
            totalPages,
            facets,
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: CACHE_TTL });

        return res.json(response);
    } catch (err) {
        console.error("Search error:", err);
        return res.status(500).json({ error: 1, message: "Search failed" });
    }
}

export async function getAutoSuggestions(req: Request, res: Response) {
    try {
        const { q } = req.query as { q?: string };
        if (!q || q.trim().length < 2) {
            return res.json({ suggestions: [] });
        }

        const redis = getRedis();
        const cacheKey = `suggest:${q.trim().toLowerCase()}`;

        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
            return res.json(parsed);
        }

        const collection = await getHospitalCollection();

        const results = await collection
            .find(
                { Hospital_Name: { $regex: q.trim(), $options: "i" } },
                { projection: { Hospital_Name: 1, State: 1, District: 1, Pincode: 1, _id: 0 } }
            )
            .limit(10)
            .toArray();

        const response = {
            suggestions: results.map((r) => ({
                name: r.Hospital_Name,
                state: r.State,
                district: r.District,
                pincode: r.Pincode,
            })),
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 60 });

        return res.json(response);
    } catch (err) {
        console.error("Suggestions error:", err);
        return res.status(500).json({ error: 1, message: "Suggestions failed" });
    }
}

export async function getFacets(req: Request, res: Response) {
    try {
        const redis = getRedis();
        const cacheKey = "facets:all";

        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
            return res.json(parsed);
        }

        const collection = await getHospitalCollection();

        const [stateAgg, totalHospitals] = await Promise.all([
            collection
                .aggregate([
                    { $group: { _id: "$State", count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                    { $limit: 50 },
                ])
                .toArray(),
            collection.countDocuments({}),
        ]);

        const response = {
            states: stateAgg
                .filter((b) => b._id)
                .map((b) => ({ value: b._id as string, count: b.count as number })),
            totalHospitals,
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 600 });

        return res.json(response);
    } catch (err) {
        console.error("Facets error:", err);
        return res.status(500).json({ error: 1, message: "Facets failed" });
    }
}

