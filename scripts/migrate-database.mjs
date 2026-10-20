import {createDatabasePool} from '../lib/database.js';
import {migrateApplicationSchema} from '../lib/database-schema.js';

// Run as the schema owner from an authenticated operator shell or deployment job.
// Never expose the owner URL to client code or print provider errors/credentials.
const pool=createDatabasePool('ledger');
try{
  await migrateApplicationSchema(pool,{runtimeRole:process.env.DB_RUNTIME_ROLE});
  console.info('Reviewed database migration completed');
}catch(error){console.error('Database migration failed',{code:/^[A-Z0-9_]{1,40}$/.test(error.code || '')?error.code:'MIGRATION_FAILED'});process.exitCode=1;}
finally{await pool.end();}
