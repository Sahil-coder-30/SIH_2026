import mongoose from 'mongoose';

export const connectToDb = async () => {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGO_URI is not defined in environment variables');
        await mongoose.connect(uri);
        console.log('[shopkeeper-service DB] Connected to MongoDB successfully');

        try {
            const collections = await mongoose.connection.db.listCollections({ name: 'packevents' }).toArray();
            if (collections.length > 0) {
                const indexes = await mongoose.connection.db.collection('packevents').indexes();
                if (indexes.some(idx => idx.name === 'eventId_1')) {
                    await mongoose.connection.db.collection('packevents').dropIndex('eventId_1');
                    console.log('[shopkeeper-service DB] Dropped obsolete eventId_1 index from packevents');
                }
            }
        } catch (idxErr) {
            console.warn('[shopkeeper-service DB] Index cleanup notice:', idxErr.message);
        }
    } catch (error) {
        console.error('[shopkeeper-service DB] Connection error:', error.message);
        process.exit(1);
    }
};

