const mongoose = require('mongoose');
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'changeme';
const MONGO_URI = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb:27017/trackerDB?authSource=admin`;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
