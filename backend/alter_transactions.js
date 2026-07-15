require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stock_inventory_db',
    port: process.env.DB_PORT || 3306,
  };

  try {
    const connection = await mysql.createConnection(dbConfig);
    
    // Check if column exists first to make it idempotent
    const [columns] = await connection.query("SHOW COLUMNS FROM transactions LIKE 'user_email'");
    if (columns.length === 0) {
      await connection.query("ALTER TABLE transactions ADD COLUMN user_email VARCHAR(255) DEFAULT NULL AFTER to_warehouse_id");
      console.log("✅ Successfully added user_email to transactions");
    } else {
      console.log("ℹ️ user_email already exists in transactions");
    }
    
    await connection.end();
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrate();
