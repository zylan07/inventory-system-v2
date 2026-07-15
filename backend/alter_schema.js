const { getPool, initDb } = require('./db');

async function alterSchema() {
  await initDb(); // Ensures DB and tables are created so we can alter
  const pool = getPool();
  try {
    console.log('Altering schema...');
    
    // Check if columns exist to avoid duplicate column errors
    const [columns] = await pool.query('SHOW COLUMNS FROM users');
    const colNames = columns.map(c => c.Field);

    let alterQueries = [];

    if (!colNames.includes('google_id')) {
      alterQueries.push('ADD COLUMN google_id VARCHAR(255) UNIQUE NULL');
    }
    if (!colNames.includes('name')) {
      alterQueries.push('ADD COLUMN name VARCHAR(255) NULL');
    }
    if (!colNames.includes('profile_image')) {
      alterQueries.push('ADD COLUMN profile_image VARCHAR(255) NULL');
    }
    if (!colNames.includes('is_verified')) {
      alterQueries.push('ADD COLUMN is_verified BOOLEAN DEFAULT TRUE');
    }

    if (alterQueries.length > 0) {
      await pool.query(`ALTER TABLE users ${alterQueries.join(', ')}`);
      console.log('Columns added.');
    }

    // Make password nullable
    await pool.query('ALTER TABLE users MODIFY password VARCHAR(255) NULL');
    console.log('Password made nullable.');

    console.log('Schema alteration complete.');
  } catch (error) {
    console.error('Error altering schema:', error);
  } finally {
    process.exit(0);
  }
}

alterSchema();
