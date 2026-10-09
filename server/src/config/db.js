import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[db] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
