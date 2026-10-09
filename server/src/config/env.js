import 'dotenv/config';

const REQUIRED = ['MONGODB_URI', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `\n[config] Missing required environment variable(s): ${missing.join(', ')}\n` +
      '[config] Copy server/.env.example to server/.env and fill in the values.\n'
  );
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

if (process.env.JWT_SECRET.length < 32) {
  const msg = '[config] JWT_SECRET should be at least 32 characters long.';
  if (isProd) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`${msg} (allowed in development only)`);
}

export const env = Object.freeze({
  nodeEnv,
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean),
  // 50 in production: judges and demo users on campus Wi-Fi often share one public IP.
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT) || (isProd ? 50 : 100),
  // Optional services. Not configured = those endpoints answer 503 and everything
  // else keeps working. (P3's media.js / aiMemory.js read their own keys from process.env.)
  cloudinary: cloudinaryConfig(),
  aiEnabled: Boolean(process.env.GEMINI_API_KEY),
});

function cloudinaryConfig() {
  const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const set = keys.filter((k) => process.env[k]);
  if (set.length === 0) return null;
  if (set.length < keys.length) {
    console.warn(`[config] Cloudinary partly configured; missing ${keys.filter((k) => !process.env[k]).join(', ')}. Uploads disabled.`);
    return null;
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}
