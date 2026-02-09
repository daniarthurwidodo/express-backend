import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

const AUTH_SECRET = process.env.AUTH_SECRET || 'your-secret-key-change-in-production';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/mydb';

export const auth = betterAuth({
  database: new Pool({
    connectionString: DATABASE_URL,
  }),
  secret: AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.User;
