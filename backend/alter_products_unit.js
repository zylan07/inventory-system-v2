const { getPool, initDb } = require('./db');

async function alterProducts() {
  await initDb();
  const pool = getPool();
  try {
    console.log('Altering products table to add unit...');
    const [columns] = await pool.query("SHOW COLUMNS FROM products LIKE 'unit'");
    if (columns.length === 0) {
      await pool.query("ALTER TABLE products ADD COLUMN unit VARCHAR(255) DEFAULT 'pcs' AFTER model_no");
      console.log('✅ Column unit added to products table.');
    } else {
      console.log('ℹ️ Column unit already exists in products table.');
    }
  } catch (err) {
    console.error('❌ Error altering products table:', err.message);
  } finally {
    process.exit(0);
  }
}

alterProducts();
