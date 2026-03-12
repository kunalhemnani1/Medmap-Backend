import { Client } from "@elastic/elasticsearch";
let esClient = null;
export function getElasticClient() {
    if (esClient)
        return esClient;
    const node = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
    esClient = new Client({ node });
    return esClient;
}
export const HOSPITAL_INDEX = "hospitals";
export const HOSPITAL_MAPPINGS = {
    properties: {
        id: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        type: { type: "keyword" },
        address: { type: "text" },
        city: { type: "text", fields: { keyword: { type: "keyword" } } },
        district: { type: "keyword" },
        state: { type: "keyword" },
        pincode: { type: "integer" },
        location_coordinates: { type: "text" },
        latitude: { type: "float" },
        longitude: { type: "float" },
        location: { type: "geo_point" },
        telephone: { type: "keyword" },
        mobile: { type: "keyword" },
        emergency: { type: "keyword" },
        email: { type: "keyword" },
        website: { type: "keyword" },
        specialties: { type: "keyword" },
        beds: { type: "integer" },
        rating: { type: "float" },
        review_count: { type: "integer" },
        accreditations: { type: "keyword" },
        established_year: { type: "integer" },
        has_emergency: { type: "boolean" },
        has_ambulance: { type: "boolean" },
        has_pharmacy: { type: "boolean" },
        has_blood_bank: { type: "boolean" },
        has_icu: { type: "boolean" },
        accepts_insurance: { type: "boolean" },
        consultation_fee_range: { type: "integer" },
        avg_wait_time_days: { type: "integer" },
        image_url: { type: "keyword" },
        created_at: { type: "date" },
        updated_at: { type: "date" },
    },
};
