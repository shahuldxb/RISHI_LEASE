import sql from 'mssql';
import { readFileSync } from 'fs';

const config = {
  server: 'SQL_SERVER_HOST_REDACTED',
  database: 'leasing',
  user: 'SQL_USER_REDACTED',
  password: 'SQL_PASSWORD_REDACTED',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectTimeout: 30000,
    requestTimeout: 120000
  }
};

async function run() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('Connected successfully!');

    const versionResult = await pool.request().query('SELECT @@VERSION as v');
    console.log('SQL Server:', versionResult.recordset[0].v.substring(0, 80));

    // Check existing schemas
    const schemaResult = await pool.request().query(
      "SELECT name FROM sys.schemas WHERE name IN ('coa','lease','payables','finance','compliance','mis','security','workflow') ORDER BY name"
    );
    console.log('Existing schemas:', schemaResult.recordset.map(r => r.name).join(', ') || 'None');

    // Check existing tables
    const tableResult = await pool.request().query(
      "SELECT TABLE_SCHEMA + '.' + TABLE_NAME as tbl FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY tbl"
    );
    console.log('Existing tables:', tableResult.recordset.length);
    tableResult.recordset.forEach(r => console.log(' -', r.tbl));

    await sql.close();
    console.log('Done!');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

run();
