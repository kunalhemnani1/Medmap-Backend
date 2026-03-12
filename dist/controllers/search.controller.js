var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getElasticClient, HOSPITAL_INDEX } from "../lib/elastic.js";
import { getRedis } from "../lib/redis.js";
import crypto from "crypto";
const CACHE_TTL = 300; // 5 minutes
function buildCacheKey(query) {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    return `search:${hash}`;
}
export function searchHospitals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const { q, state, district, pincode, page: pageStr = "1", limit: limitStr = "12", sort = "relevance", lat, lon, distance, } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 12));
            const from = (page - 1) * limit;
            // Check Redis cache
            const redis = getRedis();
            const cacheKey = buildCacheKey(req.query);
            const cached = yield redis.get(cacheKey);
            if (cached) {
                const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
                return res.json(parsed);
            }
            const es = getElasticClient();
            const userLat = lat ? parseFloat(lat) : null;
            const userLon = lon ? parseFloat(lon) : null;
            const distKm = distance ? parseFloat(distance) : null;
            // ── Build Elasticsearch query ─────────────────────────────────────────
            const must = [];
            const filter = [];
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
            if (state)
                filter.push({ term: { state } });
            if (district)
                filter.push({ term: { district } });
            if (pincode) {
                const pin = parseInt(pincode, 10);
                if (!isNaN(pin))
                    filter.push({ term: { pincode: pin } });
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
            const esQuery = {
                bool: Object.assign(Object.assign({}, (must.length > 0 ? { must } : { must: [{ match_all: {} }] })), (filter.length > 0 ? { filter } : {})),
            };
            // ── Sort ──────────────────────────────────────────────────────────────
            const esSort = [];
            if (sort === "distance" && userLat != null && userLon != null) {
                esSort.push({
                    _geo_distance: {
                        location: { lat: userLat, lon: userLon },
                        order: "asc",
                        unit: "km",
                    },
                });
            }
            else if (sort === "name-asc") {
                esSort.push({ "name.keyword": { order: "asc" } });
            }
            else if (sort === "name-desc") {
                esSort.push({ "name.keyword": { order: "desc" } });
            }
            else if (sort === "rating") {
                esSort.push({ rating: { order: "desc" } });
            }
            else if (q && q.trim()) {
                esSort.push({ _score: { order: "desc" } });
            }
            else {
                esSort.push({ "name.keyword": { order: "asc" } });
            }
            // ── Build search body ─────────────────────────────────────────────────
            const searchBody = {
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
            const esResult = yield es.search({
                index: HOSPITAL_INDEX,
                body: searchBody,
            });
            const hits = esResult.hits.hits.map((hit) => {
                var _a, _b;
                const source = hit._source;
                const distVal = (_b = (_a = hit.fields) === null || _a === void 0 ? void 0 : _a.distance_km) === null || _b === void 0 ? void 0 : _b[0];
                if (distVal != null) {
                    source._distance_km = Math.round(distVal * 10) / 10;
                }
                return source;
            });
            const total = typeof esResult.hits.total === "number"
                ? esResult.hits.total
                : (_b = (_a = esResult.hits.total) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0;
            const totalPages = Math.max(1, Math.ceil(total / limit));
            // ── Sidebar facets from Elasticsearch aggregations ────────────────────
            const facetResult = yield es.search({
                index: HOSPITAL_INDEX,
                body: Object.assign(Object.assign({ size: 0 }, (state ? { query: { term: { state } } } : {})), { aggs: {
                        states: { terms: { field: "state", size: 50 } },
                        districts: { terms: { field: "district", size: 200 } },
                    } }),
            });
            const statesBuckets = (_e = (_d = (_c = facetResult.aggregations) === null || _c === void 0 ? void 0 : _c.states) === null || _d === void 0 ? void 0 : _d.buckets) !== null && _e !== void 0 ? _e : [];
            const districtsBuckets = (_h = (_g = (_f = facetResult.aggregations) === null || _f === void 0 ? void 0 : _f.districts) === null || _g === void 0 ? void 0 : _g.buckets) !== null && _h !== void 0 ? _h : [];
            const facets = {
                states: statesBuckets.map((b) => ({ value: b.key, count: b.doc_count })),
                districts: districtsBuckets.map((b) => ({ value: b.key, count: b.doc_count })),
            };
            const response = {
                results: hits,
                total,
                page,
                limit,
                totalPages,
                facets,
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: CACHE_TTL });
            return res.json(response);
        }
        catch (err) {
            console.error("Search error:", err);
            return res.status(500).json({ error: 1, message: "Search failed" });
        }
    });
}
export function getAutoSuggestions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { q } = req.query;
            if (!q || q.trim().length < 2) {
                return res.json({ suggestions: [] });
            }
            const redis = getRedis();
            const cacheKey = `suggest:${q.trim().toLowerCase()}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
                return res.json(parsed);
            }
            const es = getElasticClient();
            const esResult = yield es.search({
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
                suggestions: esResult.hits.hits.map((hit) => ({
                    name: hit._source.name,
                    state: hit._source.state,
                    district: hit._source.district,
                    pincode: hit._source.pincode,
                })),
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 60 });
            return res.json(response);
        }
        catch (err) {
            console.error("Suggestions error:", err);
            return res.status(500).json({ error: 1, message: "Suggestions failed" });
        }
    });
}
export function getFacets(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        try {
            const redis = getRedis();
            const cacheKey = "facets:all";
            const cached = yield redis.get(cacheKey);
            if (cached) {
                const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
                return res.json(parsed);
            }
            const es = getElasticClient();
            const esResult = yield es.search({
                index: HOSPITAL_INDEX,
                body: {
                    size: 0,
                    track_total_hits: true,
                    aggs: {
                        states: { terms: { field: "state", size: 50 } },
                    },
                },
            });
            const statesBuckets = (_c = (_b = (_a = esResult.aggregations) === null || _a === void 0 ? void 0 : _a.states) === null || _b === void 0 ? void 0 : _b.buckets) !== null && _c !== void 0 ? _c : [];
            const total = typeof esResult.hits.total === "number"
                ? esResult.hits.total
                : (_e = (_d = esResult.hits.total) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : 0;
            const response = {
                states: statesBuckets.map((b) => ({ value: b.key, count: b.doc_count })),
                totalHospitals: total,
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Facets error:", err);
            return res.status(500).json({ error: 1, message: "Facets failed" });
        }
    });
}
