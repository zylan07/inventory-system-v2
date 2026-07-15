const { getPool, initDb } = require('./db');

async function alterNotifications() {
  await initDb();
  const pool = getPool();
  try {
    console.log('Creating notification tables...');

    // 1. Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('inward', 'outward', 'transfer', 'low_stock', 'adjustment') NOT NULL,
        role VARCHAR(50) NULL,
        user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ notifications table created or already exists.');

    // 2. Create notification_reads table for per-user tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        notification_id INT NOT NULL,
        user_id INT NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notification_id, user_id),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log('✅ notification_reads table created or already exists.');

    console.log('Database schema update complete.');
  } catch (err) {
    console.error('❌ Error creating tables:', err.message);
  } finally {
    process.exit(0);
  }
}

alterNotifications();
