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
export function getBookings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { user_id, hospital_id, status, page: pageStr = "1", limit: limitStr = "20", } = req.query;
            const page = Math.max(1, parseInt(pageStr) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));
            const skip = (page - 1) * limit;
            const filter = {};
            if (user_id)
                filter.User_Id = user_id;
            if (hospital_id)
                filter.Hospital_Id = parseInt(hospital_id, 10);
            if (status)
                filter.Status = status;
            const coll = yield getCollection("bookings");
            const [results, total] = yield Promise.all([
                coll.find(filter).sort({ Appointment_Date: -1 }).skip(skip).limit(limit).toArray(),
                coll.countDocuments(filter),
            ]);
            return res.json({
                results: results.map((b) => ({
                    id: b.Booking_Id,
                    hospital_id: b.Hospital_Id,
                    hospital_name: b.Hospital_Name,
                    state: b.State,
                    district: b.District,
                    user_id: b.User_Id,
                    user_name: b.User_Name,
                    procedure: b.Procedure_Name,
                    category: b.Procedure_Category,
                    appointment_date: b.Appointment_Date,
                    appointment_time: b.Appointment_Time,
                    status: b.Status,
                    doctor_name: b.Doctor_Name,
                    estimated_cost: b.Estimated_Cost_INR,
                    advance_paid: b.Advance_Paid_INR,
                    balance: b.Balance_Amount_INR,
                    payment_status: b.Payment_Status,
                    payment_method: b.Payment_Method,
                    booking_date: b.Booking_Date,
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            });
        }
        catch (err) {
            console.error("Bookings error:", err);
            return res.status(500).json({ error: "Failed to fetch bookings" });
        }
    });
}
export function getBookingById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const redis = getRedis();
            const cacheKey = `booking:${id}`;
            const cached = yield redis.get(cacheKey);
            if (cached) {
                return res.json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
            const coll = yield getCollection("bookings");
            const booking = yield coll.findOne({ Booking_Id: id });
            if (!booking)
                return res.status(404).json({ error: "Booking not found" });
            const response = {
                id: booking.Booking_Id,
                hospital_id: booking.Hospital_Id,
                hospital_name: booking.Hospital_Name,
                state: booking.State,
                district: booking.District,
                user_id: booking.User_Id,
                user_name: booking.User_Name,
                user_mobile: booking.User_Mobile,
                procedure: booking.Procedure_Name,
                category: booking.Procedure_Category,
                appointment_date: booking.Appointment_Date,
                appointment_time: booking.Appointment_Time,
                status: booking.Status,
                doctor_name: booking.Doctor_Name,
                estimated_cost: booking.Estimated_Cost_INR,
                advance_paid: booking.Advance_Paid_INR,
                balance: booking.Balance_Amount_INR,
                payment_status: booking.Payment_Status,
                payment_method: booking.Payment_Method,
                booking_source: booking.Booking_Source,
                booking_date: booking.Booking_Date,
                confirmation_sent: booking.Confirmation_Sent,
                reminder_sent: booking.Reminder_Sent,
            };
            yield redis.set(cacheKey, JSON.stringify(response), { ex: 120 });
            return res.json(response);
        }
        catch (err) {
            console.error("Booking detail error:", err);
            return res.status(500).json({ error: "Failed to fetch booking" });
        }
    });
}
