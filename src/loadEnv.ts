/**
 * Environment Variables Loader
 * 
 * WHY IS THIS NEEDED?
 * 
 * In ES6 modules (TypeScript/Node.js), `import` statements are "hoisted" - 
 * they are executed BEFORE any other code in the file, even if they appear 
 * later in the source code.
 * 
 * PROBLEM:
 * When we do `import { pool } from './db'`, Node.js:
 * 1. First processes ALL import statements (hoisting)
 * 2. Loads dbConnection.ts which creates the Pool
 * 3. Pool needs process.env variables (DB_HOST, DB_USER, etc.)
 * 4. BUT dotenv.config() hasn't run yet!
 * 5. Result: Pool gets undefined values
 * 
 * SOLUTION:
 * By calling `require('dotenv').config()` at the TOP of this file,
 * and then importing this file FIRST in any file that needs env vars,
 * we ensure the environment is loaded before any other imports execute.
 * 
 * USAGE:
 * ```typescript
 * // Load env FIRST!
 * import './loadEnv';
 * 
 * // Now we can import modules that depend on process.env
 * import { pool } from './db';
 * ```
 */

// Load environment variables from config.env file
// This executes immediately when this module is imported
require('dotenv').config({ path: './config.env' });

// Export process.env for convenience (optional)
export default process.env;
