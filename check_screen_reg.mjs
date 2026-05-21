import sql from 'mssql';
const cfg = { server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||'1433'), database: process.env.MSSQL_DATABASE, user: process.env.MSSQL_USER, password: process.env.MSSQL_PASSWORD, options: { encrypt: true, trustServerCertificate: true } };
const pool = await sql.connect(cfg);
const r = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='security' AND TABLE_NAME='screen_registry' ORDER BY ORDINAL_POSITION`);
console.log('screen_registry columns:', r.recordset.map(c=>`${c.COLUMN_NAME}(${c.DATA_TYPE})`).join(', '));
const sample = await pool.request().query(`SELECT TOP 2 * FROM security.screen_registry`);
console.log('sample:', JSON.stringify(sample.recordset[0]||{}, null, 2));
await pool.close();
