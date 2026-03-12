var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { MongoClient } from "mongodb";
let client = null;
let db = null;
export function getMongoDb() {
    return __awaiter(this, void 0, void 0, function* () {
        if (db)
            return db;
        const uri = process.env.MONGO_URI;
        if (!uri)
            throw new Error("MONGO_URI is not set");
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 30000,
        });
        yield client.connect();
        db = client.db("medmap");
        return db;
    });
}
export function getCollection(name) {
    return __awaiter(this, void 0, void 0, function* () {
        const database = yield getMongoDb();
        return database.collection(name);
    });
}
export function getHospitalCollection() {
    return __awaiter(this, void 0, void 0, function* () {
        return getCollection("hospitals");
    });
}
