require('dotenv').config();
const { initDb, getPool } = require('./db');

async function runMigration() {
  console.log('🏁 Starting one-time warehouse snapshot backfill migration...');
  try {
    const pool = await initDb();
    const conn = await pool.getConnection();

    try {
      // 1. Backfill warehouse_name from warehouse_id
      const [res1] = await conn.query(`
        UPDATE transactions t
        JOIN warehouses w ON t.warehouse_id = w.id
        SET t.warehouse_name = w.name
        WHERE t.warehouse_name IS NULL
      `);
      console.log(`✅ Backfilled warehouse_name. Affected rows: ${res1.affectedRows}`);

      // 2. Backfill from_warehouse_name from warehouse_id (the source warehouse)
      const [res2] = await conn.query(`
        UPDATE transactions t
        JOIN warehouses w ON t.warehouse_id = w.id
        SET t.from_warehouse_name = w.name
        WHERE t.from_warehouse_name IS NULL
      `);
      console.log(`✅ Backfilled from_warehouse_name. Affected rows: ${res2.affectedRows}`);

      // 3. Backfill to_warehouse_name from to_warehouse_id
      const [res3] = await conn.query(`
        UPDATE transactions t
        JOIN warehouses w ON t.to_warehouse_id = w.id
        SET t.to_warehouse_name = w.name
        WHERE t.to_warehouse_name IS NULL AND t.to_warehouse_id IS NOT NULL
      `);
      console.log(`✅ Backfilled to_warehouse_name. Affected rows: ${res3.affectedRows}`);

    } finally {
      conn.release();
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed with error:', err.message);
    process.exit(1);
  }
}

runMigration();
