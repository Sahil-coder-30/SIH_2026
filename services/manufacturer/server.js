import dotenv from 'dotenv';
import app from './app/app.js';
import { connectToDb } from './config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    await connectToDb();
    console.log(`[manufacturer-service] Server is running on port ${PORT}`);
});
