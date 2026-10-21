import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createDatabasePool} from '../lib/database.js';

export async function isolationPreflight(pool){
  const policy=JSON.parse(await readFile(new URL('../docs/tenant-table-policy.json',import.meta.url),'utf8'));
  const known=new Set(Object.values(policy).flatMap(value=>Array.isArray(value)?value:Object.keys(value)));
  const tables=(await pool.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'")).rows;
  const unknownTables=tables.map(t=>t.tablename).filter(name=>!known.has(name));
  const counts=(await pool.query(`SELECT
    (SELECT count(*)::int FROM code_commands c JOIN customer_bot_registry b ON b.guild_id=c.guild_id AND b.bot_user_id=c.bot_user_id WHERE c.owner_id<>b.owner_id) AS code_owner_mismatches,
    (SELECT count(*)::int FROM ai_bot_connections c LEFT JOIN customer_bot_registry b ON b.guild_id=c.guild_id AND b.bot_user_id=c.bot_user_id WHERE b.bot_user_id IS NULL OR c.owner_id<>b.owner_id) AS selected_owner_mismatches,
    (SELECT count(*)::int FROM code_project_jobs j LEFT JOIN code_commands c ON c.id=j.command_id WHERE c.id IS NULL) AS orphan_code_jobs`)).rows[0];
  return {ok:unknownTables.length===0 && Object.values(counts).every(n=>n===0),checkedAt:new Date().toISOString(),tableCount:tables.length,rlsTableCount:tables.filter(t=>t.rowsecurity).length,unknownTables,...counts};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const pool=createDatabasePool('web');
  try{const result=await isolationPreflight(pool);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;}
  catch(error){console.error('Isolation preflight unavailable',{code:/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'CHECK_FAILED'});process.exitCode=1;}
  finally{await pool.end();}
}
