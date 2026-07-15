const { getPool } = require('../db');

async function maintenanceMiddleware(req, res, next) {
  // Bypasses login/verification routes and health checks
  if (req.path.startsWith('/auth') || req.path === '/health') {
    return next();
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'maintenance_mode'");
    
    if (rows.length > 0) {
      const mode = rows[0].setting_value;
      if (mode && mode.enabled) {
        // Allow ONLY Admin
        if (req.user && req.user.role === 'Admin') {
          return next();
        } else {
          return res.status(503).json({
            success: false,
            maintenance: true,
            message: mode.message || 'System is currently under maintenance. Please try again later.'
          });
        }
      }
    }
  } catch (err) {
    console.error('Maintenance middleware database check failed:', err.message);
  }

  next();
}

module.exports = maintenanceMiddleware;
