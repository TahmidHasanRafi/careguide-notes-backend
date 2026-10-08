import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

// Hide credentials when logging the connection target.
const safeTarget = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, {
      dbName: env.mongoDb,
      serverSelectionTimeoutMS: 8000,
      // Builds the indexes declared with schema.index() (and nothing else).
      autoIndex: true,
    });
  } catch (err) {
    console.error(`MongoDB connection to ${safeTarget(env.mongoUri)} failed: ${err.message}`);
    const text = `${err.name} ${err.message}`;
    if (/querySrv|ENOTFOUND|ETIMEOUT/i.test(text) && env.mongoUri.startsWith('mongodb+srv://')) {
      console.error(
        'The Atlas address could not be looked up (DNS). Try: set your network DNS to 8.8.8.8 / 1.1.1.1,\n' +
          'or in Atlas use Connect -> Drivers -> "Node.js 2.2.12 or later" standard connection string (mongodb://...).'
      );
    } else if (/whitelist|not authorized|IP that isn't|Could not connect to any servers/i.test(text) && env.mongoUri.includes('mongodb.net')) {
      console.error('Atlas refused the connection. Add this machine\'s IP in Atlas -> Security -> Network Access.');
    } else if (/bad auth|Authentication failed/i.test(text)) {
      console.error('Wrong Atlas username or password in backend/config.js (Atlas -> Security -> Database Access).');
    }
    if (/ECONNREFUSED|ServerSelection/i.test(text) && /127\.0\.0\.1|localhost/.test(env.mongoUri)) {
      console.error(
        'Is the local MongoDB service running?\n' +
          '  Windows: services.msc -> "MongoDB Server (MongoDB)" -> Start   (or, as admin: net start MongoDB)\n' +
          '  Linux:   sudo systemctl start mongod'
      );
    }
    throw err;
  }
  const { host, port, name } = mongoose.connection;
  const admin = mongoose.connection.db.admin();
  const { version } = await admin.serverInfo().catch(() => ({ version: 'unknown' }));
  console.log(`MongoDB ${version} connected (${host}:${port}, db: ${name})`);
  if (version !== 'unknown' && Number(version.split('.')[0]) < 5) {
    console.warn('Warning: MongoDB 5.0+ is required for the $lookup (localField + pipeline) used in Scenario 2.');
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
