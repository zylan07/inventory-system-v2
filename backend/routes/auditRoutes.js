const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireAdmin } = require('../middleware/authMiddleware');

// GET /audit-logs - Query audit logs with advanced filtering, sorting and server-side pagination
router.get('/', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { q, moduleName, actionType, role, status, startDate, endDate } = req.query;

    let whereClauses = [];
    let queryParams = [];

    // Search query matches User, Email, Module, Action, Description, Reference ID, Old/New values
    if (q && q.trim()) {
      const searchWildcard = `%${q.trim()}%`;
      whereClauses.push(
        `(user_name LIKE ? OR user_email LIKE ? OR module LIKE ? OR action LIKE ? OR description LIKE ? OR reference_id LIKE ? OR old_value LIKE ? OR new_value LIKE ?)`
      );
      queryParams.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard);
    }

    if (moduleName) {
      whereClauses.push('module = ?');
      queryParams.push(moduleName);
    }

    if (actionType) {
      whereClauses.push('action = ?');
      queryParams.push(actionType);
    }

    if (role) {
      whereClauses.push('role = ?');
      queryParams.push(role);
    }

    if (status) {
      whereClauses.push('status = ?');
      queryParams.push(status);
    }

    if (startDate) {
      whereClauses.push('created_at >= ?');
      queryParams.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      whereClauses.push('created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Query count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM audit_logs ${whereSql}`,
      queryParams
    );
    const total = countRows[0].total;

    // Query rows (newest first)
    const [rows] = await pool.query(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Failed to fetch audit logs:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
