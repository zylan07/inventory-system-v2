const { getPool, initDb } = require('./db');

async function runMigration() {
  console.log('🔄 Running Purchase Team & Queue schema migration...');
  await initDb();
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    // 1. Add purchase_team column to users table
    const [userCols] = await conn.query('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    
    if (!userColNames.includes('purchase_team')) {
      await conn.query('ALTER TABLE users ADD COLUMN purchase_team BOOLEAN DEFAULT FALSE');
      console.log('➕ Added purchase_team column to users.');
    } else {
      console.log('ℹ️ Column purchase_team already exists in users.');
    }

    // 2. Create purchase_queue table
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
    console.log('✅ purchase_queue table verified.');

    console.log('🎉 Migration completed successfully.');
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
