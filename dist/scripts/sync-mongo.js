var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import "dotenv/config";
import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
const DATAHUB = path.resolve(import.meta.dirname, "../../../datahub");
const COLLECTIONS = {
    hospitals: "hospitals.json",
    doctors: "doctors.json",
    reviews: "reviews.json",
    pricing: "pricing.json",
    bookings: "bookings.json",
    insurance_plans: "insurance_plans.json",
    medical_bills: "medical_bills.json",
    medications: "medications.json",
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = process.env.MONGO_URI;
        if (!uri)
            throw new Error("MONGO_URI not set");
        const client = new MongoClient(uri);
        yield client.connect();
        const db = client.db("medmap");
        console.log("Connected to MongoDB");
        for (const [collName, fileName] of Object.entries(COLLECTIONS)) {
            const filePath = path.join(DATAHUB, fileName);
            if (!fs.existsSync(filePath)) {
                console.log(`  SKIP ${fileName} (not found)`);
                continue;
            }
            console.log(`\nSyncing ${fileName} → ${collName}...`);
            const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            console.log(`  Loaded ${data.length} records`);
            const coll = db.collection(collName);
            yield coll.drop().catch(() => { });
            const BATCH = 5000;
            for (let i = 0; i < data.length; i += BATCH) {
                const batch = data.slice(i, i + BATCH);
                yield coll.insertMany(batch, { ordered: false });
                process.stdout.write(`  Inserted ${Math.min(i + BATCH, data.length)} / ${data.length}\r`);
            }
            console.log(`  ✓ ${data.length} documents inserted`);
        }
        // Create indexes for query performance
        console.log("\nCreating indexes...");
        const hospitals = db.collection("hospitals");
        yield hospitals.createIndex({ Sr_No: 1 }, { unique: true });
        yield hospitals.createIndex({ State: 1 });
        yield hospitals.createIndex({ District: 1 });
        yield hospitals.createIndex({ Hospital_Name: "text", Location: "text" });
        const doctors = db.collection("doctors");
        yield doctors.createIndex({ Doctor_Id: 1 }, { unique: true });
        yield doctors.createIndex({ Hospital_Id: 1 });
        yield doctors.createIndex({ Specialty: 1 });
        yield doctors.createIndex({ State: 1 });
        const reviews = db.collection("reviews");
        yield reviews.createIndex({ Review_Id: 1 }, { unique: true });
        yield reviews.createIndex({ Hospital_Id: 1 });
        yield reviews.createIndex({ Rating: 1 });
        const pricing = db.collection("pricing");
        yield pricing.createIndex({ Hospital_Id: 1 });
        yield pricing.createIndex({ Procedure_Category: 1 });
        yield pricing.createIndex({ State: 1, Procedure_Name: 1 });
        yield pricing.createIndex({ Procedure_Name: "text" });
        yield pricing.createIndex({ Price_INR: 1 });
        const bookings = db.collection("bookings");
        yield bookings.createIndex({ Booking_Id: 1 }, { unique: true });
        yield bookings.createIndex({ User_Id: 1 });
        yield bookings.createIndex({ Hospital_Id: 1 });
        const insurance = db.collection("insurance_plans");
        yield insurance.createIndex({ Plan_Id: 1 }, { unique: true });
        yield insurance.createIndex({ Plan_Type: 1 });
        yield insurance.createIndex({ Insurance_Provider: 1 });
        const bills = db.collection("medical_bills");
        yield bills.createIndex({ Bill_Id: 1 }, { unique: true });
        yield bills.createIndex({ Hospital_Id: 1 });
        yield bills.createIndex({ User_Id: 1 });
        const meds = db.collection("medications");
        yield meds.createIndex({ Medicine_Id: 1 }, { unique: true });
        yield meds.createIndex({ Medicine_Name: "text", Generic_Name: "text" });
        console.log("✓ Indexes created\n");
        console.log("Sync complete!");
        yield client.close();
    });
}
main().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
});
