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
        language VARCHAR(10) NOT NULL DEFAULT 'en',
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

    // SUPPLIERS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        contact_person VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prepopulate default supplier if empty
    const [supplierCount] = await conn.query('SELECT COUNT(*) as count FROM suppliers');
    if (supplierCount[0].count === 0) {
      await conn.query(`
        INSERT INTO suppliers (id, name, contact_person, phone, email) 
        VALUES (1, 'Direct/Default Supplier', 'System Default', '000-000-0000', 'default@supplier.com')
      `);
    }

    // CLIENTS TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL UNIQUE,
        contact_person VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(255) NULL,
        gst VARCHAR(15) NULL,
        address TEXT NULL,
        city VARCHAR(100) NULL,
        state VARCHAR(100) NULL,
        industry VARCHAR(100) NULL,
        remarks TEXT NULL,
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
        lead_time_days INT DEFAULT 0,
        safety_stock INT DEFAULT 0,
        preferred_supplier_id INT NULL,
        reorder_quantity INT DEFAULT 0,
        purchase_price DECIMAL(10, 2) DEFAULT 0.00,
        selling_price DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_model_no (model_no),
        FOREIGN KEY (preferred_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
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
        client_id INT NULL,
        unit_price DECIMAL(10, 2) DEFAULT 0.00,
        total_value DECIMAL(12, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
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
          logoUrl: null,
          versionMetadata: { version: 1, updatedBy: 'System', updatedAt: new Date().toISOString() }
        })]
      ];

      for (const [key, val] of defaultSettings) {
        await conn.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [key, val]);
      }
      console.log('✅ Default settings prepopulated.');
    }

    // Clean up deprecated settings keys
    await conn.query("DELETE FROM system_settings WHERE setting_key NOT IN ('company_info', 'business_configuration')");

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