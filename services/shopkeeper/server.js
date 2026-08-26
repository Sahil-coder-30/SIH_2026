import 'dotenv/config';
import app from './src/app/app.js';
import { connectToDb } from './src/config/db.js';

const PORT = process.env.PORT || 3002;

connectToDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[shopkeeper-service] Server is running on port ${PORT}`);
    });

}).catch(err => {
    console.error('[shopkeeper-service] Failed to start:', err.message);
});
