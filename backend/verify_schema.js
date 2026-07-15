const { getPool } = require('./db');

async function checkSchema() {
  try {
    const [rows] = await getPool().query('DESCRIBE users;');
    console.log(rows);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

checkSchema();
