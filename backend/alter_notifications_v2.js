const { getPool, initDb } = require('./db');

async function alterNotificationsV2() {
  await initDb();
  const pool = getPool();
  try {
    console.log('Altering notification schema for V2 features...');

    const [columns] = await pool.query('SHOW COLUMNS FROM notifications');
    const colNames = columns.map(c => c.Field);

    let alterQueries = [];

    if (!colNames.includes('redirect_path')) {
      alterQueries.push('ADD COLUMN redirect_path VARCHAR(255) NULL');
    }
    if (!colNames.includes('group_count')) {
      alterQueries.push('ADD COLUMN group_count INT DEFAULT 1');
    }

    if (alterQueries.length > 0) {
      await pool.query(`ALTER TABLE notifications ${alterQueries.join(', ')}`);
      console.log('✅ Added redirect_path and group_count to notifications table.');
    } else {
      console.log('✅ Schema is already up to date.');
    }

  } catch (err) {
    console.error('❌ Error updating tables:', err.message);
  } finally {
    process.exit(0);
  }
}

alterNotificationsV2();
