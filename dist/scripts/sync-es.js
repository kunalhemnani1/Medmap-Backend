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
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getElasticClient, HOSPITAL_INDEX, HOSPITAL_MAPPINGS } from "../lib/elastic.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JSON_DATA_PATH = resolve(__dirname, "../../../datahub/hospitals.json");
function parseCoordinates(coord) {
    if (!coord || !coord.trim())
        return null;
    const parts = coord.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { lat: parts[0], lon: parts[1] };
    }
    return null;
}
function transformHospital(raw) {
    var _a, _b;
    const coords = parseCoordinates(raw.Location_Coordinates);
    return {
        id: `HOSP${String(raw.Sr_No).padStart(5, "0")}`,
        name: raw.Hospital_Name,
        address: raw.Address_Original_First_Line || raw.Location || "",
        state: raw.State,
        district: raw.District,
        pincode: raw.Pincode,
        latitude: (_a = coords === null || coords === void 0 ? void 0 : coords.lat) !== null && _a !== void 0 ? _a : null,
        longitude: (_b = coords === null || coords === void 0 ? void 0 : coords.lon) !== null && _b !== void 0 ? _b : null,
        location: coords, // geo_point — null if no coordinates
        location_coordinates: raw.Location_Coordinates || "",
        telephone: String(raw.Telephone || ""),
        mobile: String(raw.Mobile_Number || ""),
        emergency: String(raw.Emergency_Num || ""),
    };
}
function syncElasticsearch() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log(`Reading data from: ${JSON_DATA_PATH}`);
        const rawJson = readFileSync(JSON_DATA_PATH, "utf-8");
        const docs = JSON.parse(rawJson);
        console.log(`Loaded ${docs.length} documents.`);
        const es = getElasticClient();
        // Check ES connectivity
        const info = yield es.info();
        console.log(`Connected to Elasticsearch ${info.version.number}`);
        // Delete existing index if it exists
        const indexExists = yield es.indices.exists({ index: HOSPITAL_INDEX });
        if (indexExists) {
            yield es.indices.delete({ index: HOSPITAL_INDEX });
            console.log(`Deleted existing index '${HOSPITAL_INDEX}'.`);
        }
        // Create index with mappings
        yield es.indices.create({
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
            const body = batch.flatMap((raw) => {
                const doc = transformHospital(raw);
                return [
                    { index: { _index: HOSPITAL_INDEX, _id: doc.id } },
                    doc,
                ];
            });
            const result = yield es.bulk({ body, refresh: false });
            if (result.errors) {
                const errored = result.items.filter((item) => { var _a; return (_a = item.index) === null || _a === void 0 ? void 0 : _a.error; });
                console.error(`Batch had ${errored.length} errors. First:`, (_b = (_a = errored[0]) === null || _a === void 0 ? void 0 : _a.index) === null || _b === void 0 ? void 0 : _b.error);
            }
            indexed += batch.length;
            console.log(`Indexed ${indexed} / ${docs.length} documents...`);
        }
        // Refresh index to make documents searchable
        yield es.indices.refresh({ index: HOSPITAL_INDEX });
        console.log(`\nSync complete. Total documents indexed: ${indexed}`);
        // Verify count
        const count = yield es.count({ index: HOSPITAL_INDEX });
        console.log(`Verified document count in ES: ${count.count}`);
        process.exit(0);
    });
}
syncElasticsearch().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
});
