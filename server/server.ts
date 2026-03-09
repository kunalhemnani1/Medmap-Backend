import express from 'express'
import 'dotenv/config'
import morgan from 'morgan';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import searchRouter from './routes/search.js';
import hospitalRouter from './routes/hospital.js';
import pricingRouter from './routes/pricing.js';
import reviewRouter from './routes/review.js';
import doctorRouter from './routes/doctor.js';
import insuranceRouter from './routes/insurance.js';
import medicationRouter from './routes/medication.js';
import bookingRouter from './routes/booking.js';


const app = express();
const port = 8000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.all("/api/auth/{*any}/", toNodeHandler(auth));
app.use("/api", searchRouter);
app.use("/api", hospitalRouter);
app.use("/api", pricingRouter);
app.use("/api", reviewRouter);
app.use("/api", doctorRouter);
app.use("/api", insuranceRouter);
app.use("/api", medicationRouter);
app.use("/api", bookingRouter);


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})