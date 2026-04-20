const { defineConfig } = require('drizzle-kit');
require('dotenv').config({ path: './config.env' });

module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/**/*.ts', // All schema files in schema directory
  out: './migrations',
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: false,
  },
  verbose: true,
  strict: true,
});
