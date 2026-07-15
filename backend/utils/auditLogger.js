const { getPool } = require('../db');

async function logAction(req, { module, action, reference_type, reference_id, old_value, new_value, description, status = 'SUCCESS' }) {
  try {
    const pool = getPool();
    
    // Extract user info from req (authMiddleware attaches decoded JWT to req.user)
    const userId = req && req.user ? req.user.id : null;
    const userEmail = req && req.user ? req.user.email : null;
    const userRole = req && req.user ? req.user.role : null;
    
    let userName = null;
    if (userId) {
      try {
        const [rows] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
        if (rows.length > 0) userName = rows[0].name;
      } catch (e) {
        console.error('Failed to query user name for audit log:', e.message);
      }
    }

    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null;
    const browser = req ? req.headers['user-agent'] : null;

    await pool.query(
      `INSERT INTO audit_logs 
       (user_id, user_name, user_email, role, module, action, reference_type, reference_id, old_value, new_value, description, status, ip_address, browser) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        userName, 
        userEmail, 
        userRole, 
        module, 
        action, 
        reference_type, 
        reference_id, 
        old_value ? JSON.stringify(old_value) : null, 
        new_value ? JSON.stringify(new_value) : null, 
        description, 
        status, 
        ipAddress, 
        browser
      ]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAction };
