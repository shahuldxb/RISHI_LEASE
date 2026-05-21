import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);

const sql = `
CREATE TABLE IF NOT EXISTS lease_alert_configs (
  config_id       INT AUTO_INCREMENT PRIMARY KEY,
  event_type      VARCHAR(200) NOT NULL,
  days_before     INT NOT NULL DEFAULT 30,
  recipient_roles VARCHAR(500) NOT NULL DEFAULT 'admin',
  email_template  TEXT,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  milestone_id    INT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const conn = await pool.getConnection();
try {
  await conn.query(sql);
  console.log("lease_alert_configs table created/verified");
} finally {
  conn.release();
  await pool.end();
}
