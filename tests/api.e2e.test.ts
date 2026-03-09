import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../server/server.js";

/*
 * E2E tests for MedMap backend API.
 * These hit the real Express router (but may require running services
 * like Elasticsearch and MongoDB for full responses).
 * Tests validate route existence, response shape, and status codes.
 */

// ── Search ──────────────────────────────────────────────────────
describe("GET /api/search/hospitals", () => {
    it("returns 200 with results array", async () => {
        const res = await request(app).get("/api/search/hospitals?q=apollo");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("results");
        expect(Array.isArray(res.body.results)).toBe(true);
    });

    it("returns paginated results", async () => {
        const res = await request(app).get("/api/search/hospitals?q=hospital&page=1&limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("total");
        expect(res.body).toHaveProperty("page");
    });
});

describe("GET /api/search/suggest", () => {
    it("returns 200 with suggestions", async () => {
        const res = await request(app).get("/api/search/suggest?q=ap");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("suggestions");
    });
});

describe("GET /api/search/facets", () => {
    it("returns 200 with filter facets", async () => {
        const res = await request(app).get("/api/search/facets");
        expect(res.status).toBe(200);
    });
});

// ── Hospitals ───────────────────────────────────────────────────
describe("GET /api/hospitals/stats", () => {
    it("returns 200 with hospital statistics", async () => {
        const res = await request(app).get("/api/hospitals/stats");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("total_hospitals");
    });
});

describe("GET /api/hospitals/compare", () => {
    it("returns 400 without ids param", async () => {
        const res = await request(app).get("/api/hospitals/compare");
        expect([400, 422]).toContain(res.status);
    });
});

// ── Pricing ─────────────────────────────────────────────────────
describe("GET /api/pricing/categories", () => {
    it("returns 200 with categories", async () => {
        const res = await request(app).get("/api/pricing/categories");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("categories");
        expect(Array.isArray(res.body.categories)).toBe(true);
    });
});

describe("GET /api/pricing/search", () => {
    it("returns 200 with results", async () => {
        const res = await request(app).get("/api/pricing/search?limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("results");
    });
});

describe("GET /api/pricing/estimate", () => {
    it("returns pricing estimates for a procedure", async () => {
        const res = await request(app).get("/api/pricing/estimate?procedure=MRI");
        expect(res.status).toBe(200);
    });
});

// ── Doctors ─────────────────────────────────────────────────────
describe("GET /api/doctors", () => {
    it("returns 200 with doctor list", async () => {
        const res = await request(app).get("/api/doctors?limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("doctors");
    });
});

describe("GET /api/doctors/specialties", () => {
    it("returns specialty list", async () => {
        const res = await request(app).get("/api/doctors/specialties");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("specialties");
    });
});

// ── Reviews ─────────────────────────────────────────────────────
describe("GET /api/reviews", () => {
    it("returns 200 with reviews", async () => {
        const res = await request(app).get("/api/reviews?limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("reviews");
    });
});

describe("GET /api/reviews/stats", () => {
    it("returns review statistics", async () => {
        const res = await request(app).get("/api/reviews/stats");
        expect(res.status).toBe(200);
    });
});

// ── Insurance ───────────────────────────────────────────────────
describe("GET /api/insurance/plans", () => {
    it("returns 200 with plans", async () => {
        const res = await request(app).get("/api/insurance/plans?limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("plans");
    });
});

// ── Medications ─────────────────────────────────────────────────
describe("GET /api/medications", () => {
    it("returns 200 with medications", async () => {
        const res = await request(app).get("/api/medications?limit=5");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("medications");
    });
});

// ── Bookings ────────────────────────────────────────────────────
describe("GET /api/bookings", () => {
    it("returns 200 with bookings", async () => {
        const res = await request(app).get("/api/bookings");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("bookings");
    });
});

// ── Bookmarks (auth required) ───────────────────────────────────
describe("GET /api/bookmarks", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).get("/api/bookmarks");
        expect(res.status).toBe(401);
    });
});

describe("POST /api/bookmarks", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app)
            .post("/api/bookmarks")
            .send({ hospitalId: "test-id" });
        expect(res.status).toBe(401);
    });
});

describe("DELETE /api/bookmarks/:hospitalId", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).delete("/api/bookmarks/test-id");
        expect(res.status).toBe(401);
    });
});

// ── Rate Limiting ───────────────────────────────────────────────
describe("Rate limiting", () => {
    it("includes rate limit headers", async () => {
        const res = await request(app).get("/api/search/hospitals?q=test");
        expect(res.headers).toHaveProperty("ratelimit-limit");
    });
});
