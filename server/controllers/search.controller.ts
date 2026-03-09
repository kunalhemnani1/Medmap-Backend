import { Request, Response } from "express";
import { getElasticClient, HOSPITAL_INDEX } from "../lib/elastic.js";
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
            lat,
            lon,
            distance,
        } = req.query as SearchQuery;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 12));
        const from = (page - 1) * limit;

        // Check Redis cache
        const redis = getRedis();
        const cacheKey = buildCacheKey(req.query as SearchQuery);

        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
            return res.json(parsed);
        }

        const es = getElasticClient();

        const userLat = lat ? parseFloat(lat) : null;
        const userLon = lon ? parseFloat(lon) : null;
        const distKm = distance ? parseFloat(distance) : null;

        // ── Build Elasticsearch query ─────────────────────────────────────────
        const must: any[] = [];
        const filter: any[] = [];

        if (q && q.trim()) {
            must.push({
                multi_match: {
                    query: q.trim(),
                    fields: [
                        "name^3",
                        "city^2",
                        "address",
                        "state",
                        "district",
                        "specialties",
                    ],
                    fuzziness: "AUTO",
                    prefix_length: 1,
                    type: "best_fields",
                },
            });
        }

        if (state) filter.push({ term: { state } });
        if (district) filter.push({ term: { district } });
        if (pincode) {
            const pin = parseInt(pincode, 10);
            if (!isNaN(pin)) filter.push({ term: { pincode: pin } });
        }

        // Geo distance filter
        if (userLat != null && userLon != null && distKm != null) {
            filter.push({
                geo_distance: {
                    distance: `${distKm}km`,
                    location: { lat: userLat, lon: userLon },
                },
            });
        }

        const esQuery: any = {
            bool: {
                ...(must.length > 0 ? { must } : { must: [{ match_all: {} }] }),
                ...(filter.length > 0 ? { filter } : {}),
            },
        };

        // ── Sort ──────────────────────────────────────────────────────────────
        const esSort: any[] = [];
        if (sort === "distance" && userLat != null && userLon != null) {
            esSort.push({
                _geo_distance: {
                    location: { lat: userLat, lon: userLon },
                    order: "asc",
                    unit: "km",
                },
            });
        } else if (sort === "name-asc") {
            esSort.push({ "name.keyword": { order: "asc" } });
        } else if (sort === "name-desc") {
            esSort.push({ "name.keyword": { order: "desc" } });
        } else if (sort === "rating") {
            esSort.push({ rating: { order: "desc" } });
        } else if (q && q.trim()) {
            esSort.push({ _score: { order: "desc" } });
        } else {
            esSort.push({ "name.keyword": { order: "asc" } });
        }

        // ── Build search body ─────────────────────────────────────────────────
        const searchBody: any = {
            query: esQuery,
            sort: esSort,
            from,
            size: limit,
            track_total_hits: true,
        };

        // Add script field for distance if user location provided
        if (userLat != null && userLon != null) {
            searchBody.script_fields = {
                distance_km: {
                    script: {
                        source: "if (doc['location'].size() == 0) return null; return doc['location'].arcDistance(params.lat, params.lon) / 1000",
                        params: { lat: userLat, lon: userLon },
                    },
                },
            };
            searchBody._source = true;
        }

        // ── Execute search ────────────────────────────────────────────────────
        const esResult = await es.search({
            index: HOSPITAL_INDEX,
            body: searchBody,
        });

        const hits = esResult.hits.hits.map((hit: any) => {
            const source = hit._source;
            const distVal = hit.fields?.distance_km?.[0];
            if (distVal != null) {
                source._distance_km = Math.round(distVal * 10) / 10;
            }
            return source;
        });
        const total =
            typeof esResult.hits.total === "number"
                ? esResult.hits.total
                : (esResult.hits.total as any)?.value ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        // ── Sidebar facets from Elasticsearch aggregations ────────────────────
        const facetResult = await es.search({
            index: HOSPITAL_INDEX,
            body: {
                size: 0,
                ...(state ? { query: { term: { state } } } : {}),
                aggs: {
                    states: { terms: { field: "state", size: 50 } },
                    districts: { terms: { field: "district", size: 200 } },
                },
            },
        });

        const statesBuckets = (facetResult.aggregations?.states as any)?.buckets ?? [];
        const districtsBuckets = (facetResult.aggregations?.districts as any)?.buckets ?? [];

        const facets = {
            states: statesBuckets.map((b: any) => ({ value: b.key, count: b.doc_count })),
            districts: districtsBuckets.map((b: any) => ({ value: b.key, count: b.doc_count })),
        };

        const response = {
            results: hits,
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

        const es = getElasticClient();

        const esResult = await es.search({
            index: HOSPITAL_INDEX,
            body: {
                query: {
                    multi_match: {
                        query: q.trim(),
                        fields: ["name^3", "city", "state", "district"],
                        fuzziness: "AUTO",
                        prefix_length: 1,
                    },
                },
                _source: ["name", "state", "district", "pincode"],
                size: 10,
            },
        });

        const response = {
            suggestions: esResult.hits.hits.map((hit: any) => ({
                name: hit._source.name,
                state: hit._source.state,
                district: hit._source.district,
                pincode: hit._source.pincode,
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

        const es = getElasticClient();

        const esResult = await es.search({
            index: HOSPITAL_INDEX,
            body: {
                size: 0,
                track_total_hits: true,
                aggs: {
                    states: { terms: { field: "state", size: 50 } },
                },
            },
        });

        const statesBuckets = (esResult.aggregations?.states as any)?.buckets ?? [];
        const total =
            typeof esResult.hits.total === "number"
                ? esResult.hits.total
                : (esResult.hits.total as any)?.value ?? 0;

        const response = {
            states: statesBuckets.map((b: any) => ({ value: b.key, count: b.doc_count })),
            totalHospitals: total,
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 600 });

        return res.json(response);
    } catch (err) {
        console.error("Facets error:", err);
        return res.status(500).json({ error: 1, message: "Facets failed" });
    }
}


