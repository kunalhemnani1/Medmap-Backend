import { Client } from "@elastic/elasticsearch";

let esClient: Client | null = null;

export function getElasticClient(): Client {
    if (esClient) return esClient;

    const node = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
    esClient = new Client({ node });
    return esClient;
}

export const HOSPITAL_INDEX = "hospitals";

export const HOSPITAL_MAPPINGS = {
    properties: {
        id: { type: "keyword" as const },
        name: { type: "text" as const, fields: { keyword: { type: "keyword" as const } } },
        type: { type: "keyword" as const },
        address: { type: "text" as const },
        city: { type: "text" as const, fields: { keyword: { type: "keyword" as const } } },
        district: { type: "keyword" as const },
        state: { type: "keyword" as const },
        pincode: { type: "integer" as const },
        location_coordinates: { type: "text" as const },
        latitude: { type: "float" as const },
        longitude: { type: "float" as const },
        location: { type: "geo_point" as const },
        telephone: { type: "keyword" as const },
        mobile: { type: "keyword" as const },
        emergency: { type: "keyword" as const },
        email: { type: "keyword" as const },
        website: { type: "keyword" as const },
        specialties: { type: "keyword" as const },
        beds: { type: "integer" as const },
        rating: { type: "float" as const },
        review_count: { type: "integer" as const },
        accreditations: { type: "keyword" as const },
        established_year: { type: "integer" as const },
        has_emergency: { type: "boolean" as const },
        has_ambulance: { type: "boolean" as const },
        has_pharmacy: { type: "boolean" as const },
        has_blood_bank: { type: "boolean" as const },
        has_icu: { type: "boolean" as const },
        accepts_insurance: { type: "boolean" as const },
        consultation_fee_range: { type: "integer" as const },
        avg_wait_time_days: { type: "integer" as const },
        image_url: { type: "keyword" as const },
        created_at: { type: "date" as const },
        updated_at: { type: "date" as const },
    },
};
