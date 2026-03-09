import express from 'express'
import 'dotenv/config'
import morgan from 'morgan';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import searchRouter from './routes/search.js';


const app = express();
const port = 8000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.all("/api/auth/{*any}/", toNodeHandler(auth));
app.use("/api", searchRouter);


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})