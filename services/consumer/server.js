import dotenv from 'dotenv';
import app from './src/app/app.js';

dotenv.config();

const PORT = process.env.PORT || 3003;

// Consumer service is stateless — no DB connection needed
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[consumer-service] Server is running on port ${PORT}`);
});

