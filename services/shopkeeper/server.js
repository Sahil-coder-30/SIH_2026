import dotenv from 'dotenv';
import app from './src/app/app.js';
import { connectToDb } from './src/config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3002;

app.listen(PORT, async () => {
    await connectToDb();
    console.log(`[shopkeeper-service] Server is running on port ${PORT}`);
});
