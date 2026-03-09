import { MongoClient, Db, Collection } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoDb(): Promise<Db> {
    if (db) return db;

    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not set");

    client = new MongoClient(uri);
    await client.connect();
    db = client.db("hospital_data");
    return db;
}

export async function getHospitalCollection(): Promise<Collection> {
    const database = await getMongoDb();
    return database.collection("hospital");
}
