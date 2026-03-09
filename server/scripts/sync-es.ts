import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getElasticClient, HOSPITAL_INDEX, HOSPITAL_MAPPINGS } from "../lib/elastic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSON_DATA_PATH = resolve(
    __dirname,
    "../../../datahub/hospitals.json"
);

interface HospitalDoc {
    id: string;
    name: string;
    type: string;
    address: string;
    city: string;
    district: string;
    state: string;
    pincode: number;
    location_coordinates: string;
    latitude: number;
    longitude: number;
    telephone: string;
    mobile: string;
    emergency: string;
    email: string;
    website: string;
    specialties: string[];
    beds: number;
    rating: number;
    review_count: number;
    accreditations: string[];
    established_year: number;
    has_emergency: boolean;
    has_ambulance: boolean;
    has_pharmacy: boolean;
    has_blood_bank: boolean;
    has_icu: boolean;
    accepts_insurance: boolean;
    consultation_fee_range: number[];
    avg_wait_time_days: number;
    image_url: string;
    created_at: string;
    updated_at: string;
}

async function syncElasticsearch() {
    console.log(`Reading data from: ${JSON_DATA_PATH}`);
    const rawJson = readFileSync(JSON_DATA_PATH, "utf-8");
    const docs: HospitalDoc[] = JSON.parse(rawJson);
    console.log(`Loaded ${docs.length} documents.`);

    const es = getElasticClient();

    // Check ES connectivity
    const info = await es.info();
    console.log(`Connected to Elasticsearch ${info.version.number}`);

    // Delete existing index if it exists
    const indexExists = await es.indices.exists({ index: HOSPITAL_INDEX });
    if (indexExists) {
        await es.indices.delete({ index: HOSPITAL_INDEX });
        console.log(`Deleted existing index '${HOSPITAL_INDEX}'.`);
    }

    // Create index with mappings
    await es.indices.create({
        index: HOSPITAL_INDEX,
        body: {
            settings: {
                number_of_shards: 1,
                number_of_replicas: 0,
            },
            mappings: HOSPITAL_MAPPINGS,
        },
    });
    console.log(`Created index '${HOSPITAL_INDEX}' with mappings.`);

    // Bulk index in batches
    const BATCH_SIZE = 2000;
    let indexed = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const body = batch.flatMap((doc) => [
            { index: { _index: HOSPITAL_INDEX, _id: doc.id } },
            doc,
        ]);

        const result = await es.bulk({ body, refresh: false });
        if (result.errors) {
            const errored = result.items.filter((item: any) => item.index?.error);
            console.error(`Batch had ${errored.length} errors. First:`, errored[0]?.index?.error);
        }

        indexed += batch.length;
        console.log(`Indexed ${indexed} / ${docs.length} documents...`);
    }

    // Refresh index to make documents searchable
    await es.indices.refresh({ index: HOSPITAL_INDEX });
    console.log(`\nSync complete. Total documents indexed: ${indexed}`);

    // Verify count
    const count = await es.count({ index: HOSPITAL_INDEX });
    console.log(`Verified document count in ES: ${count.count}`);

    process.exit(0);
}

syncElasticsearch().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
});

