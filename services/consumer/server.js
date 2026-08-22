import dotenv from 'dotenv';
import app from './app/app.js';

dotenv.config();

const PORT = process.env.PORT || 3003;

// Consumer service is stateless — no DB connection needed
app.listen(PORT, () => {
    console.log(`[consumer-service] Server is running on port ${PORT}`);
});
