const express = require('express');
const { getPool } = require('../db');
const router = express.Router();

// GET /notifications
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const userRole = req.user.role;

    // Filter by role
    let roleCondition = '';
    let queryParams = [userId];

    if (userRole === 'Admin') {
      roleCondition = '1=1'; // Admins see everything
    } else if (userRole === 'Manager') {
      roleCondition = "n.role = 'Manager' OR n.role = 'All' OR n.user_id = ?";
      queryParams.push(userId);
    } else {
      // Basic User
      roleCondition = "n.role = 'Basic User' OR n.role = 'All' OR n.user_id = ?";
      queryParams.push(userId);
    }

    const [rows] = await pool.query(`
      SELECT 
        n.*, 
        CASE WHEN nr.read_at IS NOT NULL THEN TRUE ELSE FALSE END as is_read
      FROM notifications n
      LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
      WHERE ${roleCondition}
      ORDER BY n.created_at DESC
      LIMIT 50
    `, queryParams);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    const pool = getPool();
    const notificationId = req.params.id;
    const userId = req.user.id;

    await pool.query(`
      INSERT IGNORE INTO notification_reads (notification_id, user_id)
      VALUES (?, ?)
    `, [notificationId, userId]);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
});

module.exports = router;
