const { getPool, initDb } = require('./db');

async function alterLatch() {
  await initDb();
  const pool = getPool();
  try {
    console.log('Altering schema to add alert_sent latch to stock table...');
    
    const [columns] = await pool.query('SHOW COLUMNS FROM stock');
    const colNames = columns.map(c => c.Field);

    if (!colNames.includes('alert_sent')) {
      await pool.query('ALTER TABLE stock ADD COLUMN alert_sent BOOLEAN DEFAULT FALSE');
      console.log('Column alert_sent added successfully.');
    } else {
      console.log('Column alert_sent already exists.');
    }

    console.log('Schema altering complete.');
  } catch (error) {
    console.error('Error altering schema:', error);
  } finally {
    process.exit(0);
  }
}

alterLatch();
