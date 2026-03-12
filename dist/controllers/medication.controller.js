var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";
export function searchMedications(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { q, form, prescription, available, sort = "name", page: pageStr = "1", limit: limitStr = "20", } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
            const skip = (page - 1) * limit;
            const filter = {};
            if (q)
                filter.$text = { $search: q };
            if (form)
                filter.Dosage_Form = form;
            if (prescription === "true")
                filter.Prescription_Required = true;
            if (prescription === "false")
                filter.Prescription_Required = false;
            if (available === "true")
                filter.Available = true;
            const sortObj = sort === "price-asc" ? { Final_Price_INR: 1 } :
                sort === "price-desc" ? { Final_Price_INR: -1 } :
                    { Medicine_Name: 1 };
            const coll = yield getCollection("medications");
            const [results, total] = yield Promise.all([
                coll.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
                coll.countDocuments(filter),
            ]);
            return res.json({
                results: results.map((m) => ({
                    id: m.Medicine_Id,
                    name: m.Medicine_Name,
                    generic_name: m.Generic_Name,
                    strength: m.Strength,
                    form: m.Dosage_Form,
                    manufacturer: m.Manufacturer,
                    pack_size: m.Pack_Size,
                    mrp: m.MRP_INR,
                    discount: m.Discount_Percentage,
                    final_price: m.Final_Price_INR,
                    prescription_required: m.Prescription_Required,
                    schedule: m.Schedule,
                    storage: m.Storage_Instructions,
                    side_effects: m.Common_Side_Effects,
                    available: m.Available,
                    stock: m.Stock_Quantity,
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            });
        }
        catch (err) {
            console.error("Medications error:", err);
            return res.status(500).json({ error: "Failed to search medications" });
        }
    });
}
export function getMedicationById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const redis = getRedis();
            const cacheKey = `med:${id}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("medications");
            const med = yield coll.findOne({ Medicine_Id: id });
            if (!med)
                return res.status(404).json({ error: "Medication not found" });
            const response = {
                id: med.Medicine_Id,
                name: med.Medicine_Name,
                generic_name: med.Generic_Name,
                strength: med.Strength,
                form: med.Dosage_Form,
                manufacturer: med.Manufacturer,
                pack_size: med.Pack_Size,
                price_per_unit: med.Price_Per_Unit_INR,
                mrp: med.MRP_INR,
                discount: med.Discount_Percentage,
                final_price: med.Final_Price_INR,
                prescription_required: med.Prescription_Required,
                schedule: med.Schedule,
                storage: med.Storage_Instructions,
                expiry_date: med.Expiry_Date,
                side_effects: med.Common_Side_Effects,
                interactions: med.Drug_Interactions,
                available: med.Available,
                stock: med.Stock_Quantity,
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Medication detail error:", err);
            return res.status(500).json({ error: "Failed to fetch medication" });
        }
    });
}
export function checkInteractions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { medicines } = req.query;
            if (!medicines)
                return res.status(400).json({ error: "medicines parameter required (comma-separated)" });
            const names = medicines.split(",").map((n) => n.trim()).filter(Boolean);
            if (names.length < 2)
                return res.status(400).json({ error: "At least 2 medicines required" });
            const coll = yield getCollection("medications");
            const meds = yield coll.find({
                Medicine_Name: { $in: names.map((n) => new RegExp(n, "i")) },
            }).toArray();
            // Cross-check Drug_Interactions fields
            const interactions = [];
            for (const med of meds) {
                if (med.Drug_Interactions) {
                    const interactionList = Array.isArray(med.Drug_Interactions)
                        ? med.Drug_Interactions
                        : [med.Drug_Interactions];
                    for (const interaction of interactionList) {
                        for (const otherName of names) {
                            if (otherName.toLowerCase() !== med.Medicine_Name.toLowerCase() &&
                                interaction.toLowerCase().includes(otherName.toLowerCase())) {
                                interactions.push({
                                    medicine: med.Medicine_Name,
                                    interacts_with: otherName,
                                    details: interaction,
                                });
                            }
                        }
                    }
                }
            }
            return res.json({
                medicines: names,
                found: meds.map((m) => m.Medicine_Name),
                interactions,
                has_interactions: interactions.length > 0,
            });
        }
        catch (err) {
            console.error("Interaction check error:", err);
            return res.status(500).json({ error: "Interaction check failed" });
        }
    });
}
