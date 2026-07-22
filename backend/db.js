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
    let connection;
    let dbExists = false;

    // Step 1: Attempt to connect directly to the configured database
    try {
      connection = await mysql.createConnection({
        ...dbConfig,
        database: DB_NAME
      });
      console.log(`✅ Connected directly to existing database: ${DB_NAME}`);
      dbExists = true;
      await connection.end();
    } catch (directError) {
      // If error is not 'Unknown database' (1049 / ER_BAD_DB_ERROR), propagate it.
      // Hostinger incorrect credentials will throw ER_ACCESS_DENIED_ERROR (1045) here,
      // which we propagate so it fails with a clear message and doesn't try setup.
      if (directError.errno !== 1049 && directError.code !== 'ER_BAD_DB_ERROR') {
        throw directError;
      }
    }

    // Step 2: If database does not exist, try to create it (local development fallback)
    if (!dbExists) {
      console.log(`ℹ️ Database "${DB_NAME}" does not exist. Attempting to create...`);
      const setupConn = await mysql.createConnection(dbConfig);
      await setupConn.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
      console.log('✅ Database created successfully.');
      await setupConn.end();
    }

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
        purchase_team BOOLEAN DEFAULT FALSE,
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
        model_no VARCHAR(255) NOT NULL,
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
        UNIQUE KEY unique_model_product (model_no, product_name),
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
        warehouse_id VARCHAR(50) NULL,
        from_warehouse_id VARCHAR(50) DEFAULT NULL,
        to_warehouse_id VARCHAR(50) DEFAULT NULL,
        user_email VARCHAR(255) DEFAULT NULL,
        narration TEXT,
        client_id INT NULL,
        unit_price DECIMAL(10, 2) DEFAULT 0.00,
        total_value DECIMAL(12, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
      )
    `);

    // PURCHASE_QUEUE TABLE
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        warehouse_id VARCHAR(50) NOT NULL,
        reorder_qty INT NOT NULL,
        status ENUM('Pending', 'Ordered', 'Received', 'Cancelled') NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_product_warehouse (product_id, warehouse_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
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
    await conn.query("DELETE FROM system_settings WHERE setting_key NOT IN ('company_info', 'business_configuration', 'schema_migrations')");

    // ------------------------------------------------------------
    // CLIENT FEEDBACK ROUND 3 MIGRATIONS
    // ------------------------------------------------------------

    // 1. Drop strict model_no uniqueness constraint and add composite (model_no, product_name) uniqueness constraint
    try {
      const [indexes] = await conn.query('SHOW INDEX FROM products WHERE Key_name = "model_no" AND Non_unique = 0');
      if (indexes.length > 0) {
        await conn.query('ALTER TABLE products DROP INDEX model_no');
        console.log('✅ Dropped unique index model_no from products table.');
      }
    } catch (err) {
      console.log('ℹ️ model_no index check/drop status:', err.message);
    }

    try {
      const [compIndexes] = await conn.query('SHOW INDEX FROM products WHERE Key_name = "unique_model_product"');
      if (compIndexes.length === 0) {
        await conn.query('ALTER TABLE products ADD UNIQUE KEY unique_model_product (model_no, product_name)');
        console.log('✅ Created composite unique index (model_no, product_name) on products table.');
      }
    } catch (err) {
      console.error('❌ Failed to add composite unique index unique_model_product:', err.message);
    }

    // 2. Create purchase_team_recipients table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_team_recipients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Checked/created purchase_team_recipients table.');

    // 3. Add snapshot columns to transactions table and backfill
    const [columns] = await conn.query('SHOW COLUMNS FROM transactions');
    const columnNames = columns.map(c => c.Field);

    if (!columnNames.includes('warehouse_name')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN warehouse_name VARCHAR(255) NULL');
      console.log('✅ Added warehouse_name column to transactions.');
    }
    if (!columnNames.includes('from_warehouse_name')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN from_warehouse_name VARCHAR(255) NULL');
      console.log('✅ Added from_warehouse_name column to transactions.');
    }
    if (!columnNames.includes('to_warehouse_name')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN to_warehouse_name VARCHAR(255) NULL');
      console.log('✅ Added to_warehouse_name column to transactions.');
    }

    // Backfill NULL snapshot fields safely and idempotently
    await conn.query(`
      UPDATE transactions t
      JOIN warehouses w ON t.warehouse_id = w.id
      SET t.warehouse_name = w.name
      WHERE t.warehouse_name IS NULL
    `);
    await conn.query(`
      UPDATE transactions t
      JOIN warehouses w ON t.warehouse_id = w.id
      SET t.from_warehouse_name = w.name
      WHERE t.from_warehouse_name IS NULL
    `);
    await conn.query(`
      UPDATE transactions t
      JOIN warehouses w ON t.to_warehouse_id = w.id
      SET t.to_warehouse_name = w.name
      WHERE t.to_warehouse_name IS NULL AND t.to_warehouse_id IS NOT NULL
    `);
    console.log('✅ Backfilled empty warehouse name snapshot fields in transactions table.');

    // 4. One-time database schema migration for warehouse deletion constraints
    let migrationsRun = { v3_legacy_fks_cleaned: false, v3_transactions_fk_altered: false };
    try {
      const [migRows] = await conn.query("SELECT setting_value FROM system_settings WHERE setting_key = 'schema_migrations'");
      if (migRows.length > 0) {
        migrationsRun = migRows[0].setting_value || migrationsRun;
      }
    } catch (migErr) {
      console.log('ℹ️ Check migrations table status/skipped:', migErr.message);
    }

    let migrationStateChanged = false;

    // A. Alter transactions.warehouse_id constraint
    if (!migrationsRun.v3_transactions_fk_altered) {
      try {
        // Alter column to be NULLable first
        await conn.query('ALTER TABLE transactions MODIFY COLUMN warehouse_id VARCHAR(50) NULL');

        // Query constraint name
        const [fkRows] = await conn.query(`
          SELECT CONSTRAINT_NAME 
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'transactions' 
            AND COLUMN_NAME = 'warehouse_id' 
            AND REFERENCED_TABLE_NAME = 'warehouses'
        `);

        if (fkRows.length > 0) {
          const constraintName = fkRows[0].CONSTRAINT_NAME;
          // Drop the old FK
          await conn.query('ALTER TABLE transactions DROP FOREIGN KEY ' + constraintName);
          console.log('✅ [Migration] Dropped old foreign key: ' + constraintName);
        }

        // Add the new FK with ON DELETE SET NULL
        try {
          await conn.query('ALTER TABLE transactions ADD CONSTRAINT fk_transactions_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL');
          console.log('✅ [Migration] Configured transactions.warehouse_id to ON DELETE SET NULL.');
        } catch (addErr) {
          if (!addErr.message.includes('Duplicate key name') && !addErr.message.includes('already exists')) {
            throw addErr;
          }
        }
        
        migrationsRun.v3_transactions_fk_altered = true;
        migrationStateChanged = true;
      } catch (e) {
        console.error('❌ [Migration] transactions.warehouse_id foreign key update failed:', e.message);
      }
    }

    // B. Clean up any legacy table foreign keys referencing warehouses
    if (!migrationsRun.v3_legacy_fks_cleaned) {
      try {
        const [legacyFks] = await conn.query(`
          SELECT TABLE_NAME, CONSTRAINT_NAME 
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
          WHERE REFERENCED_TABLE_NAME = 'warehouses'
            AND TABLE_SCHEMA = DATABASE()
        `);

        const activeTables = ['stock', 'transactions', 'purchase_queue'];

        for (const row of legacyFks) {
          if (!activeTables.includes(row.TABLE_NAME)) {
            console.log('⚠️ [Migration] Legacy constraint found: table ' + row.TABLE_NAME + ', constraint ' + row.CONSTRAINT_NAME + '. Dropping...');
            try {
              await conn.query('ALTER TABLE ' + row.TABLE_NAME + ' DROP FOREIGN KEY ' + row.CONSTRAINT_NAME);
              console.log('✅ [Migration] Successfully dropped legacy constraint ' + row.CONSTRAINT_NAME + ' from ' + row.TABLE_NAME);
            } catch (dropErr) {
              console.error('❌ [Migration] Failed to drop constraint ' + row.CONSTRAINT_NAME + ':', dropErr.message);
            }
          }
        }
        
        migrationsRun.v3_legacy_fks_cleaned = true;
        migrationStateChanged = true;
      } catch (err) {
        console.error('❌ [Migration] Legacy foreign key constraint cleanup failed:', err.message);
      }
    }

    // C. Save migration status if state changed
    if (migrationStateChanged) {
      try {
        await conn.query(
          "INSERT INTO system_settings (setting_key, setting_value) VALUES ('schema_migrations', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
          [JSON.stringify(migrationsRun), JSON.stringify(migrationsRun)]
        );
        console.log('✅ [Migration] Schema migration status updated and saved.');
      } catch (saveErr) {
        console.error('❌ [Migration] Failed to save schema migration status:', saveErr.message);
      }
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