import 'dotenv/config';
import app from './src/app/app.js';
import { connectToDb } from './src/config/db.js';

const PORT = process.env.PORT || 3001;

connectToDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[manufacturer-service] Server is running on port ${PORT}`);
    });

}).catch(err => {
    console.error('[manufacturer-service] Failed to start:', err.message);
});
