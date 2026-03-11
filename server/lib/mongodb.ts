import { MongoClient, Db, Collection } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoDb(): Promise<Db> {
    if (db) return db;

    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not set");

    client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 30000,
    });
    await client.connect();
    db = client.db("medmap");
    return db;
}

export async function getCollection(name: string): Promise<Collection> {
    const database = await getMongoDb();
    return database.collection(name);
}

export async function getHospitalCollection(): Promise<Collection> {
    return getCollection("hospitals");
}
