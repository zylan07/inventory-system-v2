const { getPool, initDb } = require('./db');

async function runMigration() {
  console.log('🔄 Starting database migration...');
  await initDb();
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    // 1. Create suppliers table
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
    console.log('✅ suppliers table verified.');

    // Seed default supplier if none exists
    const [supplierCount] = await conn.query('SELECT COUNT(*) as count FROM suppliers');
    if (supplierCount[0].count === 0) {
      await conn.query(`
        INSERT INTO suppliers (id, name, contact_person, phone, email) 
        VALUES (1, 'Direct/Default Supplier', 'System Default', '000-000-0000', 'default@supplier.com')
      `);
      console.log('🌱 Seeded default supplier.');
    }

    // 2. Create clients table
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
    console.log('✅ clients table verified.');

    // 3. Add columns to users table
    const [userCols] = await conn.query('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    if (!userColNames.includes('language')) {
      await conn.query("ALTER TABLE users ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'en'");
      console.log('➕ Added language column to users.');
    }

    // 4. Add columns to products table
    const [productCols] = await conn.query('SHOW COLUMNS FROM products');
    const productColNames = productCols.map(c => c.Field);
    
    if (!productColNames.includes('lead_time_days')) {
      await conn.query('ALTER TABLE products ADD COLUMN lead_time_days INT DEFAULT 0');
      console.log('➕ Added lead_time_days to products.');
    }
    if (!productColNames.includes('safety_stock')) {
      await conn.query('ALTER TABLE products ADD COLUMN safety_stock INT DEFAULT 0');
      console.log('➕ Added safety_stock to products.');
    }
    if (!productColNames.includes('preferred_supplier_id')) {
      await conn.query('ALTER TABLE products ADD COLUMN preferred_supplier_id INT NULL');
      console.log('➕ Added preferred_supplier_id to products.');
    }
    if (!productColNames.includes('reorder_quantity')) {
      await conn.query('ALTER TABLE products ADD COLUMN reorder_quantity INT DEFAULT 0');
      console.log('➕ Added reorder_quantity to products.');
    }
    if (!productColNames.includes('purchase_price')) {
      await conn.query('ALTER TABLE products ADD COLUMN purchase_price DECIMAL(10, 2) DEFAULT 0.00');
      console.log('➕ Added purchase_price to products.');
    }
    if (!productColNames.includes('selling_price')) {
      await conn.query('ALTER TABLE products ADD COLUMN selling_price DECIMAL(10, 2) DEFAULT 0.00');
      console.log('➕ Added selling_price to products.');
    }

    // Add preferred_supplier_id foreign key constraint if not exists
    const [pConstraints] = await conn.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_products_preferred_supplier'
    `);
    if (pConstraints.length === 0) {
      await conn.query(`
        ALTER TABLE products 
        ADD CONSTRAINT fk_products_preferred_supplier 
        FOREIGN KEY (preferred_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
      `);
      console.log('🔗 Added foreign key constraint fk_products_preferred_supplier.');
    } else {
      console.log('ℹ️ Foreign key constraint fk_products_preferred_supplier already exists.');
    }

    // 5. Add columns to transactions table
    const [txCols] = await conn.query('SHOW COLUMNS FROM transactions');
    const txColNames = txCols.map(c => c.Field);

    if (!txColNames.includes('client_id')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN client_id INT NULL');
      console.log('➕ Added client_id to transactions.');
    }
    if (!txColNames.includes('unit_price')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN unit_price DECIMAL(10, 2) DEFAULT 0.00');
      console.log('➕ Added unit_price to transactions.');
    }
    if (!txColNames.includes('total_value')) {
      await conn.query('ALTER TABLE transactions ADD COLUMN total_value DECIMAL(12, 2) DEFAULT 0.00');
      console.log('➕ Added total_value to transactions.');
    }

    // Add client_id foreign key constraint if not exists
    const [cConstraints] = await conn.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_transactions_client'
    `);
    if (cConstraints.length === 0) {
      await conn.query(`
        ALTER TABLE transactions 
        ADD CONSTRAINT fk_transactions_client 
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
      `);
      console.log('🔗 Added foreign key constraint fk_transactions_client.');
    } else {
      console.log('ℹ️ Foreign key constraint fk_transactions_client already exists.');
    }

    // 6. Prepopulate centralized business settings if empty
    const [existingSettings] = await conn.query("SELECT COUNT(*) as count FROM system_settings WHERE setting_key = 'business_configuration'");
    if (existingSettings[0].count === 0) {
      const defaultConfig = {
        company_details: {
          name: 'INVENTRA',
          address: '123 Manufacturing Way, Chennai',
          gst: '33AAAAA1111A1Z1'
        },
        regional: {
          currency_symbol: '₹',
          currency_name: 'INR',
          date_format: 'YYYY-MM-DD',
          default_language: 'en'
        },
        thresholds: {
          global_safety_multiplier: 1.5,
          low_stock_threshold: 10
        },
        notifications: {
          inventory: ['wh@inventra.com'],
          purchase: ['purchase@inventra.com'],
          client: ['billing@inventra.com'],
          security: ['security@inventra.com'],
          system: ['admin@inventra.com']
        },
        terminology: {
          ADJUSTMENT: 'Correct Stock',
          TRANSFER: 'Move Stock',
          NARRATION: 'Client',
          WAREHOUSE: 'Warehouse',
          STOCK: 'Stock'
        }
      };

      await conn.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [
        'business_configuration',
        JSON.stringify(defaultConfig)
      ]);
      console.log('🌱 Seeded default business_configuration settings.');
    }

    console.log('✅ Database migration finished successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
