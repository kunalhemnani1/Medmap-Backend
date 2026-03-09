import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getMongoDb } from "../lib/mongodb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSON_DATA_PATH = resolve(
    __dirname,
    "../../../MedMap-Frontend/src/app/api/search/hospital/hospitalsinmp.json"
);

interface HospitalDoc {
    Sr_No: number;
    Location_Coordinates?: string;
    Location?: string;
    Hospital_Name: string;
    Address_Original_First_Line?: string;
    State: string;
    District: string;
    Pincode: number | string;
    Telephone?: number | string;
    Mobile_Number?: number | string;
    Emergency_Num?: number | string;
}

/**
 * Imports hospital data from the local JSON file into MongoDB.
 * Run with: pnpm sync:mongo
 */
async function syncMongo() {
    console.log(`Reading data from: ${JSON_DATA_PATH}`);
    const rawJson = readFileSync(JSON_DATA_PATH, "utf-8");
    const docs: HospitalDoc[] = JSON.parse(rawJson);
    console.log(`Loaded ${docs.length} documents.`);

    const db = await getMongoDb();
    const collection = db.collection("hospital");

    await collection.drop().catch(() => { /* collection may not exist yet */ });
    console.log("Collection cleared.");

    await collection.createIndex(
        { Hospital_Name: "text", Location: "text", Address_Original_First_Line: "text", State: "text", District: "text" },
        { default_language: "none" }
    );
    await collection.createIndex({ State: 1 });
    await collection.createIndex({ District: 1 });
    await collection.createIndex({ Pincode: 1 });
    await collection.createIndex({ Sr_No: 1 }, { unique: true });
    console.log("Indexes created.");

    const BATCH_SIZE = 2000;
    let count = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        await collection.insertMany(batch as any[], { ordered: false });
        count += batch.length;
        console.log(`Inserted ${count} / ${docs.length} documents...`);
    }

    console.log(`\nSync complete. Total documents inserted: ${count}`);
    process.exit(0);
}

syncMongo().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
});

