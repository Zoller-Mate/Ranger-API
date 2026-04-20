/**
 * Database Reset Script
 * Drops all tables from the database and prepares for fresh migration
 * ⚠️  WARNING: This will delete ALL data!
 *
 * Usage: npm run db:reset
 */

import { Pool } from 'pg';
import '../../loadEnv';

async function resetDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: false,
  });

  try {
    console.log('🗑️  Dropping all tables...');

    // Drop all tables in public schema
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        
        -- Drop all sequences
        FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
        END LOOP;
        
        -- Drop all types
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    console.log('✅ Database reset complete!');
    console.log('📋 All tables, sequences, and types have been dropped.');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();
