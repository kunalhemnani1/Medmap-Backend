import { Request, Response } from "express";
import { getCollection } from "../lib/mongodb.js";
import { getRedis } from "../lib/redis.js";

export async function getPlans(req: Request, res: Response) {
    try {
        const {
            type,
            provider,
            min_cover,
            max_premium,
            maternity,
            sort = "premium-asc",
            page: pageStr = "1",
            limit: limitStr = "20",
        } = req.query as Record<string, string>;

        const page = Math.max(1, parseInt(pageStr) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
        const skip = (page - 1) * limit;

        const filter: any = {};
        if (type) filter.Plan_Type = type;
        if (provider) filter.Insurance_Provider = { $regex: provider, $options: "i" };
        if (min_cover) filter.Sum_Insured_INR = { $gte: parseInt(min_cover, 10) };
        if (max_premium) filter.Annual_Premium_INR = { $lte: parseInt(max_premium, 10) };
        if (maternity === "true") filter.Maternity_Covered = true;

        const sortObj: any =
            sort === "premium-desc" ? { Annual_Premium_INR: -1 } :
                sort === "cover-desc" ? { Sum_Insured_INR: -1 } :
                    sort === "settlement" ? { Claim_Settlement_Ratio_Percentage: -1 } :
                        { Annual_Premium_INR: 1 };

        const coll = await getCollection("insurance_plans");
        const [results, total] = await Promise.all([
            coll.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
            coll.countDocuments(filter),
        ]);

        return res.json({
            results: results.map((p) => ({
                id: p.Plan_Id,
                provider: p.Insurance_Provider,
                plan_name: p.Plan_Name,
                plan_type: p.Plan_Type,
                sum_insured: p.Sum_Insured_INR,
                annual_premium: p.Annual_Premium_INR,
                co_payment: p.Co_Payment_Percentage,
                deductible: p.Deductible_INR,
                room_rent_limit: p.Room_Rent_Limit_Per_Day,
                pre_hospitalization_days: p.Pre_Hospitalization_Days,
                post_hospitalization_days: p.Post_Hospitalization_Days,
                maternity_covered: p.Maternity_Covered,
                cashless_hospitals: p.Number_Of_Cashless_Hospitals,
                claim_settlement_ratio: p.Claim_Settlement_Ratio_Percentage,
                no_claim_bonus: p.No_Claim_Bonus_Percentage,
                free_health_checkup: p.Free_Health_Checkup,
                ambulance_covered: p.Ambulance_Charges_Covered,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error("Insurance plans error:", err);
        return res.status(500).json({ error: "Failed to fetch plans" });
    }
}

export async function getPlanById(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const redis = getRedis();
        const cacheKey = `insurance:${id}`;
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
        }

        const coll = await getCollection("insurance_plans");
        const plan = await coll.findOne({ Plan_Id: id });
        if (!plan) return res.status(404).json({ error: "Plan not found" });

        const response = {
            id: plan.Plan_Id,
            provider: plan.Insurance_Provider,
            plan_name: plan.Plan_Name,
            plan_type: plan.Plan_Type,
            sum_insured: plan.Sum_Insured_INR,
            annual_premium: plan.Annual_Premium_INR,
            co_payment: plan.Co_Payment_Percentage,
            deductible: plan.Deductible_INR,
            room_rent_limit: plan.Room_Rent_Limit_Per_Day,
            pre_hospitalization_days: plan.Pre_Hospitalization_Days,
            post_hospitalization_days: plan.Post_Hospitalization_Days,
            maternity_covered: plan.Maternity_Covered,
            maternity_waiting_years: plan.Maternity_Waiting_Period_Years,
            pre_existing_waiting_years: plan.Pre_Existing_Disease_Waiting_Period_Years,
            cashless_hospitals: plan.Number_Of_Cashless_Hospitals,
            claim_settlement_ratio: plan.Claim_Settlement_Ratio_Percentage,
            no_claim_bonus: plan.No_Claim_Bonus_Percentage,
            free_health_checkup: plan.Free_Health_Checkup,
            ambulance_covered: plan.Ambulance_Charges_Covered,
            max_ambulance_charges: plan.Max_Ambulance_Charges_INR,
        };

        await redis.set(cacheKey, JSON.stringify(response), { ex: 3600 });
        return res.json(response);
    } catch (err) {
        console.error("Plan detail error:", err);
        return res.status(500).json({ error: "Failed to fetch plan" });
    }
}

export async function checkCoverage(req: Request, res: Response) {
    try {
        const { procedure, plan_id } = req.query as Record<string, string>;
        if (!procedure) return res.status(400).json({ error: "procedure required" });

        // Get price estimate for the procedure
        const pricingColl = await getCollection("pricing");
        const priceStats = await pricingColl.aggregate([
            { $match: { Procedure_Name: { $regex: procedure, $options: "i" } } },
            { $group: { _id: null, avg: { $avg: "$Price_INR" }, min: { $min: "$Price_INR" }, max: { $max: "$Price_INR" } } },
        ]).toArray();

        const avgPrice = priceStats[0]?.avg ?? 0;

        // Get matching insurance plans
        const insColl = await getCollection("insurance_plans");
        const filter: any = { Sum_Insured_INR: { $gte: avgPrice } };
        if (plan_id) filter.Plan_Id = plan_id;

        const plans = await insColl.find(filter).sort({ Annual_Premium_INR: 1 }).limit(10).toArray();

        return res.json({
            procedure,
            estimated_cost: Math.round(avgPrice),
            price_range: { min: priceStats[0]?.min ?? 0, max: priceStats[0]?.max ?? 0 },
            matching_plans: plans.map((p) => ({
                id: p.Plan_Id,
                provider: p.Insurance_Provider,
                plan_name: p.Plan_Name,
                sum_insured: p.Sum_Insured_INR,
                annual_premium: p.Annual_Premium_INR,
                co_payment: p.Co_Payment_Percentage,
                out_of_pocket: Math.round(avgPrice * (p.Co_Payment_Percentage / 100)),
                claim_settlement_ratio: p.Claim_Settlement_Ratio_Percentage,
            })),
        });
    } catch (err) {
        console.error("Coverage check error:", err);
        return res.status(500).json({ error: "Coverage check failed" });
    }
}
