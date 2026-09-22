import mongoose from 'mongoose';
import { connectMongo } from '../config/mongo.js';
import { Product } from '../models/Product.js';
import { logger } from '../utils/logger.js';
const seedDatabase = async () => {
    try {
        await connectMongo();
        logger.info('Connected to MongoDB. Clearing existing test products...');
        await Product.deleteMany({});
        const dummyProducts = [
            {
                name: 'Apple MacBook Pro M2 16GB 512GB',
                brand: 'Apple',
                modelName: 'MacBook Pro',
                specs: ['16GB RAM', '512GB SSD', 'M2 Chip'],
                aliases: ['mac m2', 'macbook m2', 'm2 pro', 'mac 16/512'],
                price: 1850000,
                inStock: true,
            },
            {
                name: 'iPhone 15 Pro Max 256GB',
                brand: 'Apple',
                modelName: 'iPhone 15 Pro Max',
                specs: ['256GB', 'Titanium'],
                aliases: ['iphone 15 pm', '15 pro max', '15pm', 'i phone 15 pro max'],
                price: 1450000,
                inStock: true,
            },
            {
                name: 'Samsung Galaxy S24 Ultra 512GB',
                brand: 'Samsung',
                modelName: 'Galaxy S24 Ultra',
                specs: ['512GB', 'Snapdragon'],
                aliases: ['s24 ultra', 's24u', 'samsung s24'],
                price: 1600000,
                inStock: true,
            }
        ];
        logger.info('Inserting test products...');
        await Product.insertMany(dummyProducts);
        logger.info('✅ Database seeded successfully!');
    }
    catch (error) {
        logger.error({ error }, 'Failed to seed database');
    }
    finally {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB.');
        process.exit(0);
    }
};
seedDatabase();
