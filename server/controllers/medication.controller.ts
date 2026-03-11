import { Request, Response } from "express";
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";

export async function searchMedications(req: Request, res: Response) {
    try {
        const {
            q,
            form,
            prescription,
            available,
            sort = "name",
            page: pageStr = "1",
            limit: limitStr = "20",
        } = req.query as Record<string, string>;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
        const skip = (page - 1) * limit;

        const filter: any = {};
        if (q) filter.$text = { $search: q };
        if (form) filter.Dosage_Form = form;
        if (prescription === "true") filter.Prescription_Required = true;
        if (prescription === "false") filter.Prescription_Required = false;
        if (available === "true") filter.Available = true;

        const sortObj: any =
            sort === "price-asc" ? { Final_Price_INR: 1 } :
                sort === "price-desc" ? { Final_Price_INR: -1 } :
                    { Medicine_Name: 1 };

        const coll = await getCollection("medications");
        const [results, total] = await Promise.all([
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
    } catch (err) {
        console.error("Medications error:", err);
        return res.status(500).json({ error: "Failed to search medications" });
    }
}

export async function getMedicationById(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const redis = getRedis();
        const cacheKey = `med:${id}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("medications");
        const med = await coll.findOne({ Medicine_Id: id });
        if (!med) return res.status(404).json({ error: "Medication not found" });

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

        await redis.set(cacheKey, JSON.stringify(response), { ex: 600 });
        return res.json(response);
    } catch (err) {
        console.error("Medication detail error:", err);
        return res.status(500).json({ error: "Failed to fetch medication" });
    }
}

export async function checkInteractions(req: Request, res: Response) {
    try {
        const { medicines } = req.query as { medicines?: string };
        if (!medicines) return res.status(400).json({ error: "medicines parameter required (comma-separated)" });

        const names = medicines.split(",").map((n) => n.trim()).filter(Boolean);
        if (names.length < 2) return res.status(400).json({ error: "At least 2 medicines required" });

        const coll = await getCollection("medications");
        const meds = await coll.find({
            Medicine_Name: { $in: names.map((n) => new RegExp(n, "i")) },
        }).toArray();

        // Cross-check Drug_Interactions fields
        const interactions: { medicine: string; interacts_with: string; details: string }[] = [];
        for (const med of meds) {
            if (med.Drug_Interactions) {
                const interactionList = Array.isArray(med.Drug_Interactions)
                    ? med.Drug_Interactions
                    : [med.Drug_Interactions];
                for (const interaction of interactionList) {
                    for (const otherName of names) {
                        if (
                            otherName.toLowerCase() !== med.Medicine_Name.toLowerCase() &&
                            interaction.toLowerCase().includes(otherName.toLowerCase())
                        ) {
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
    } catch (err) {
        console.error("Interaction check error:", err);
        return res.status(500).json({ error: "Interaction check failed" });
    }
}
