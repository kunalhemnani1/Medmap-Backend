import "dotenv/config";
import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";

const DATAHUB = path.resolve(import.meta.dirname, "../../../datahub");

const COLLECTIONS: Record<string, string> = {
    hospitals: "hospitals.json",
    doctors: "doctors.json",
    reviews: "reviews.json",
    pricing: "pricing.json",
    bookings: "bookings.json",
    insurance_plans: "insurance_plans.json",
    medical_bills: "medical_bills.json",
    medications: "medications.json",
};

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI not set");

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db("medmap");
    console.log("Connected to MongoDB");

    for (const [collName, fileName] of Object.entries(COLLECTIONS)) {
        const filePath = path.join(DATAHUB, fileName);
        if (!fs.existsSync(filePath)) {
            console.log(`  SKIP ${fileName} (not found)`);
            continue;
        }

        console.log(`\nSyncing ${fileName} → ${collName}...`);
        const data: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        console.log(`  Loaded ${data.length} records`);

        const coll = db.collection(collName);
        await coll.drop().catch(() => { });

        const BATCH = 5000;
        for (let i = 0; i < data.length; i += BATCH) {
            const batch = data.slice(i, i + BATCH);
            await coll.insertMany(batch, { ordered: false });
            process.stdout.write(`  Inserted ${Math.min(i + BATCH, data.length)} / ${data.length}\r`);
        }
        console.log(`  ✓ ${data.length} documents inserted`);
    }

    // Create indexes for query performance
    console.log("\nCreating indexes...");
    const hospitals = db.collection("hospitals");
    await hospitals.createIndex({ Sr_No: 1 }, { unique: true });
    await hospitals.createIndex({ State: 1 });
    await hospitals.createIndex({ District: 1 });
    await hospitals.createIndex({ Hospital_Name: "text", Location: "text" });

    const doctors = db.collection("doctors");
    await doctors.createIndex({ Doctor_Id: 1 }, { unique: true });
    await doctors.createIndex({ Hospital_Id: 1 });
    await doctors.createIndex({ Specialty: 1 });
    await doctors.createIndex({ State: 1 });

    const reviews = db.collection("reviews");
    await reviews.createIndex({ Review_Id: 1 }, { unique: true });
    await reviews.createIndex({ Hospital_Id: 1 });
    await reviews.createIndex({ Rating: 1 });

    const pricing = db.collection("pricing");
    await pricing.createIndex({ Hospital_Id: 1 });
    await pricing.createIndex({ Procedure_Category: 1 });
    await pricing.createIndex({ State: 1, Procedure_Name: 1 });
    await pricing.createIndex({ Procedure_Name: "text" });
    await pricing.createIndex({ Price_INR: 1 });

    const bookings = db.collection("bookings");
    await bookings.createIndex({ Booking_Id: 1 }, { unique: true });
    await bookings.createIndex({ User_Id: 1 });
    await bookings.createIndex({ Hospital_Id: 1 });

    const insurance = db.collection("insurance_plans");
    await insurance.createIndex({ Plan_Id: 1 }, { unique: true });
    await insurance.createIndex({ Plan_Type: 1 });
    await insurance.createIndex({ Insurance_Provider: 1 });

    const bills = db.collection("medical_bills");
    await bills.createIndex({ Bill_Id: 1 }, { unique: true });
    await bills.createIndex({ Hospital_Id: 1 });
    await bills.createIndex({ User_Id: 1 });

    const meds = db.collection("medications");
    await meds.createIndex({ Medicine_Id: 1 }, { unique: true });
    await meds.createIndex({ Medicine_Name: "text", Generic_Name: "text" });

    console.log("✓ Indexes created\n");
    console.log("Sync complete!");

    await client.close();
}

main().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
});
