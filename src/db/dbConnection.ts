import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * The connection pool to the database.
 */
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_DATABASE,
  ssl: false,
});

// Initialize Drizzle with schema for relational queries
const db = drizzle(pool, { schema });

export default db;
