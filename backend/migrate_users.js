const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stock_inventory_db',
  port: process.env.DB_PORT || 3306,
};

async function migrate() {
  try {
    const conn = await mysql.createConnection(dbConfig);
    console.log("Connected to DB.");

    // Drop and recreate users table
    await conn.query(`DROP TABLE IF EXISTS users`);
    await conn.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('Admin', 'Manager', 'Basic User') NOT NULL DEFAULT 'Basic User',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Recreated `users` table.");

    // Drop and recreate password_resets table
    await conn.query(`DROP TABLE IF EXISTS password_resets`);
    await conn.query(`
      CREATE TABLE password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Recreated `password_resets` table.");

    // Insert Default admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await conn.query(
      `INSERT INTO users (email, password, role, is_active) VALUES (?, ?, ?, ?)`,
      ['admin@example.com', hashedPassword, 'Admin', true]
    );
    console.log("✅ Created default admin user: admin@example.com / admin123");

    await conn.end();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
