/**
 * All settings for the app, in one place. No .env file is used.
 *
 * Local: put your MongoDB URI and a JWT secret below (or set them as environment variables).
 * Vercel: production mode and the proxy setting switch on automatically; the secrets come from
 * Vercel → Project → Settings → Environment Variables (they override the values here).
 * Any value here can be overridden by a real environment variable of the same name.
 */
export default {
  // ---- MongoDB Atlas ----
  // Secret, not stored in the repository. Set it as an environment variable
  // (Vercel -> Project -> Settings -> Environment Variables) or paste it here on your own machine.
  MONGODB_URI: '',
  MONGODB_DB: 'careguide_notes',

  // ---- Auth ----
  // Secret, set JWT_SECRET as an environment variable (any random string of 32+ characters).
  JWT_SECRET: '',
  JWT_EXPIRES_IN: '1d',
  BCRYPT_ROUNDS: 12,

  // ---- Server ----
  PORT: 5050,
  HOST: '127.0.0.1',
  // Serve the frontend folder from this server (website + API on one URL).
  SERVE_FRONTEND: true,
  // Reverse proxies in front of the app: false locally (on Vercel it is set to 1 automatically).
  TRUST_PROXY: false,
  // Websites allowed to call the API from a browser (the frontend on its own domain, local tests).
  CORS_ORIGINS: ['https://care.tahmid-hasan-rafi.com', 'http://localhost:5500', 'http://127.0.0.1:5500'],
  // Also allow https://<anything>.vercel.app (Vercel preview addresses of the frontend).
  CORS_ALLOW_VERCEL_APP: true,

  // ---- First admin account (created by `npm run seed`) ----
  ADMIN_NAME: 'Admin',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'Admin123456',
};
