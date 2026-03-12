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
export function getPlans(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { type, provider, min_cover, max_premium, maternity, sort = "premium-asc", page: pageStr = "1", limit: limitStr = "20", } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
            const skip = (page - 1) * limit;
            const filter = {};
            if (type)
                filter.Plan_Type = type;
            if (provider)
                filter.Insurance_Provider = { $regex: provider, $options: "i" };
            if (min_cover)
                filter.Sum_Insured_INR = { $gte: parseInt(min_cover, 10) };
            if (max_premium)
                filter.Annual_Premium_INR = { $lte: parseInt(max_premium, 10) };
            if (maternity === "true")
                filter.Maternity_Covered = true;
            const sortObj = sort === "premium-desc" ? { Annual_Premium_INR: -1 } :
                sort === "cover-desc" ? { Sum_Insured_INR: -1 } :
                    sort === "settlement" ? { Claim_Settlement_Ratio_Percentage: -1 } :
                        { Annual_Premium_INR: 1 };
            const coll = yield getCollection("insurance_plans");
            const [results, total] = yield Promise.all([
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
        }
        catch (err) {
            console.error("Insurance plans error:", err);
            return res.status(500).json({ error: "Failed to fetch plans" });
        }
    });
}
export function getPlanById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const redis = getRedis();
            const cacheKey = `insurance:${id}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("insurance_plans");
            const plan = yield coll.findOne({ Plan_Id: id });
            if (!plan)
                return res.status(404).json({ error: "Plan not found" });
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
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 3600 });
            return res.json(response);
        }
        catch (err) {
            console.error("Plan detail error:", err);
            return res.status(500).json({ error: "Failed to fetch plan" });
        }
    });
}
export function checkCoverage(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { procedure, plan_id } = req.query;
            if (!procedure)
                return res.status(400).json({ error: "procedure required" });
            // Get price estimate for the procedure
            const pricingColl = yield getCollection("pricing");
            const priceStats = yield pricingColl.aggregate([
                { $match: { Procedure_Name: { $regex: procedure, $options: "i" } } },
                { $group: { _id: null, avg: { $avg: "$Price_INR" }, min: { $min: "$Price_INR" }, max: { $max: "$Price_INR" } } },
            ]).toArray();
            const avgPrice = (_b = (_a = priceStats[0]) === null || _a === void 0 ? void 0 : _a.avg) !== null && _b !== void 0 ? _b : 0;
            // Get matching insurance plans
            const insColl = yield getCollection("insurance_plans");
            const filter = { Sum_Insured_INR: { $gte: avgPrice } };
            if (plan_id)
                filter.Plan_Id = plan_id;
            const plans = yield insColl.find(filter).sort({ Annual_Premium_INR: 1 }).limit(10).toArray();
            return res.json({
                procedure,
                estimated_cost: Math.round(avgPrice),
                price_range: { min: (_d = (_c = priceStats[0]) === null || _c === void 0 ? void 0 : _c.min) !== null && _d !== void 0 ? _d : 0, max: (_f = (_e = priceStats[0]) === null || _e === void 0 ? void 0 : _e.max) !== null && _f !== void 0 ? _f : 0 },
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
        }
        catch (err) {
            console.error("Coverage check error:", err);
            return res.status(500).json({ error: "Coverage check failed" });
        }
    });
}
