const identifier=value=>{if(!/^[a-z][a-z0-9_]{2,47}$/.test(value || ''))throw Error('Invalid runtime role name');return '"'+value+'"';};
export async function grantRuntimeAccess(client,role){
  const name=identifier(role),database=(await client.query('SELECT current_database() AS name')).rows[0].name;
  const db='"'+database.replaceAll('"','""')+'"';
  await client.query(`GRANT CONNECT ON DATABASE ${db} TO ${name};GRANT USAGE ON SCHEMA public TO ${name};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${name};
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${name};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${name};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${name}`);
}
export async function provisionRuntimeRole(client,{role,password}){
  const name=identifier(role);
  if(typeof password!=='string' || password.length<32 || password.length>128 || !/^[A-Za-z0-9_-]+$/.test(password))throw Error('Use a 32-128 character random base64url runtime password');
  await client.query('BEGIN');
  try{
    const exists=(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length;
    if(exists)throw Error('Role already exists; this operation does not rotate existing credentials');
    // Validated base64url only; PostgreSQL role DDL does not support password bind parameters.
    await client.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40 PASSWORD '${password}'`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;REVOKE ALL ON SCHEMA public FROM ${name}`);
    await grantRuntimeAccess(client,role);
    // Runtime owns no objects and cannot migrate, truncate or create schema objects.
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
