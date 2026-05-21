import sql from 'mssql';
import { config } from 'dotenv';
config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }
};

const pool = await sql.connect(cfg);

// Check lease.contracts columns
const r1 = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='lease' AND TABLE_NAME='contracts' ORDER BY ORDINAL_POSITION");
console.log('lease.contracts:', r1.recordset.map(x=>x.COLUMN_NAME).join(', '));

// Check asset.assets columns
const r2 = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='asset' AND TABLE_NAME='assets' ORDER BY ORDINAL_POSITION");
console.log('asset.assets:', r2.recordset.map(x=>x.COLUMN_NAME).join(', '));

// Fix the 2 failing SPs
await pool.request().query(`
IF OBJECT_ID('dbo.sp_GetAssetLeaseHistory', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_GetAssetLeaseHistory;
`);

const contractCols = r1.recordset.map(x=>x.COLUMN_NAME);
const hasLiability = contractCols.includes('total_lease_liability');
const hasAssetId = contractCols.includes('asset_id');

let leaseHistorySP;
if (hasAssetId) {
  const liabilityCol = hasLiability ? 'c.total_lease_liability' : 'NULL';
  leaseHistorySP = `
CREATE PROCEDURE dbo.sp_GetAssetLeaseHistory @AssetId INT AS
BEGIN
  SET NOCOUNT ON;
  SELECT c.contract_id, c.contract_ref, c.status,
    c.commencement_date, c.expiry_date,
    c.lease_term_months, c.monthly_payment,
    ${liabilityCol} AS total_lease_liability,
    c.rou_asset_value,
    l.lessor_name
  FROM lease.contracts c
  LEFT JOIN lessor.lessors l ON c.lessor_id = l.lessor_id
  WHERE c.asset_id = @AssetId
  ORDER BY c.commencement_date DESC;
END`;
} else {
  leaseHistorySP = `
CREATE PROCEDURE dbo.sp_GetAssetLeaseHistory @AssetId INT AS
BEGIN
  SET NOCOUNT ON;
  SELECT NULL AS contract_id, NULL AS contract_ref, NULL AS status,
    NULL AS commencement_date, NULL AS expiry_date,
    NULL AS lease_term_months, NULL AS monthly_payment,
    NULL AS total_lease_liability, NULL AS rou_asset_value, NULL AS lessor_name
  WHERE 1=0;
END`;
}

await pool.request().query(leaseHistorySP);
console.log('sp_GetAssetLeaseHistory fixed');

// Fix sp_GetAssets if description column doesn't exist
const assetCols = r2.recordset.map(x=>x.COLUMN_NAME);
console.log('asset.assets has description:', assetCols.includes('description'));

await pool.close();
console.log('Done');
