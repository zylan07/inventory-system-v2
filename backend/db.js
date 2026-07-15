const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
};

const DB_NAME = process.env.DB_NAME || 'stock_inventory_db';

let pool;

async function initDb() {
  try {
    // Step 1: Connect without selecting DB
    const connection = await mysql.createConnection(dbConfig);

    // Step 2: Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
    console.log('✅ Database checked/created successfully.');

    await connection.end();

    // Step 3: Create pool with DB
    pool = mysql.createPool({
      ...dbConfig,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Step 4: Create tables
    await createTables();
    console.log('✅ Tables checked/created successfully.');

    return pool;
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  }
}

async function createTables() {
  const conn = await pool.getConnection();

  try {
    // USERS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NULL,
        name VARCHAR(255) NULL,
        google_id VARCHAR(255) UNIQUE NULL,
        profile_image VARCHAR(255) NULL,
        role ENUM('Admin', 'Manager', 'Basic User') NOT NULL DEFAULT 'Basic User',
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // PASSWORD_RESETS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // PRODUCTS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(255) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        model_no VARCHAR(255) NOT NULL UNIQUE,
        unit VARCHAR(255) DEFAULT 'pcs',
        description TEXT,
        min_stock INT DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_model_no (model_no)
      )
    `);

    // WAREHOUSES TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `);

    // Prepopulate warehouses if empty
    const [wRows] = await conn.query('SELECT COUNT(*) as count FROM warehouses');
    if (wRows[0].count === 0) {
      await conn.query(`
        INSERT INTO warehouses (id, name) VALUES 
        ('W1', 'Warehouse 1'), 
        ('W2', 'Warehouse 2'),
        ('W3', 'Warehouse 3')
      `);
      console.log('✅ Default warehouses inserted.');
    }

    // STOCK TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        warehouse_id VARCHAR(50) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        alert_sent BOOLEAN DEFAULT FALSE,
        UNIQUE KEY unique_stock (product_id, warehouse_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    `);

    // TRANSACTIONS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('INWARD', 'OUTWARD', 'TRANSFER', 'ADJUSTMENT') NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        warehouse_id VARCHAR(50) NOT NULL,
        from_warehouse_id VARCHAR(50) DEFAULT NULL,
        to_warehouse_id VARCHAR(50) DEFAULT NULL,
        user_email VARCHAR(255) DEFAULT NULL,
        narration TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
      )
    `);

    // AUDIT LOGS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_name VARCHAR(255) NULL,
        user_email VARCHAR(255) NULL,
        role VARCHAR(50) NULL,
        module VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        reference_type VARCHAR(100) NULL,
        reference_id VARCHAR(100) NULL,
        old_value JSON NULL,
        new_value JSON NULL,
        description TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
        ip_address VARCHAR(45) NULL,
        browser VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SYSTEM SETTINGS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value JSON NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Prepopulate settings if empty
    const [settingsCount] = await conn.query('SELECT COUNT(*) as count FROM system_settings');
    if (settingsCount[0].count === 0) {
      const defaultSettings = [
        ['company_info', JSON.stringify({
          name: 'Pacco Stock',
          address: '123 Pacco Road, Industrial Zone',
          phone: '+1 555-0199',
          email: 'info@pacco.com',
          website: 'https://pacco.com',
          gstNumber: '22AAAAA0000A1Z5',
          logoUrl: null,
          footerText: 'Pacco Stock Inventory © 2026',
          versionMetadata: { version: 1, updatedBy: 'System', updatedAt: new Date().toISOString() }
        })],
        ['security_settings', JSON.stringify({
          minPasswordLength: 8,
          sessionTimeout: 30,
          maxLoginAttempts: 5,
          enableGoogleLogin: true,
          enableLocalLogin: true,
          emailNotifications: true,
          versionMetadata: { version: 1, updatedBy: 'System', updatedAt: new Date().toISOString() }
        })],
        ['notification_settings', JSON.stringify({
          lowStockAlerts: true,
          emailAlerts: true,
          browserNotifications: true,
          defaultThreshold: 10,
          versionMetadata: { version: 1, updatedBy: 'System', updatedAt: new Date().toISOString() }
        })],
        ['maintenance_mode', JSON.stringify({
          enabled: false,
          message: 'System is currently under maintenance. Please try again later.',
          versionMetadata: { version: 1, updatedBy: 'System', updatedAt: new Date().toISOString() }
        })],
        ['backup_history', JSON.stringify([])]
      ];

      for (const [key, val] of defaultSettings) {
        await conn.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [key, val]);
      }
      console.log('✅ Default settings prepopulated.');
    }

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  } finally {
    conn.release();
  }
}

function getPool() {
  if (!pool) throw new Error("Pool not initialized");
  return pool;
}

module.exports = { initDb, getPool };