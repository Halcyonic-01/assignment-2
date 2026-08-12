import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:54322/postgres';

export const sql = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  // Supabase PgBouncer (transaction pooler) doesn't support prepared statements
  prepare: false,
});

export default sql;
