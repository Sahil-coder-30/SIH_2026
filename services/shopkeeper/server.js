import dotenv from 'dotenv';
import app from './app/app.js';
import { connectToDb } from './config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3002;

app.listen(PORT, async () => {
    await connectToDb();
    console.log(`[shopkeeper-service] Server is running on port ${PORT}`);
});
