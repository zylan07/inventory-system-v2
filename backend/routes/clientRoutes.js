const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { logAction } = require('../utils/auditLogger');
const { validatePhone, validateEmail, sanitizeEmail } = require('../utils/validators');
const multer = require('multer');

// Multer memory storage configuration for bulk imports
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB Limit
});

// Middleware to restrict access to Admin and Manager only
function requireAdminOrManager(req, res, next) {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'Manager')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Forbidden: Admin or Manager access required' });
  }
}

// Helper: Query settings to retrieve client activity boundaries
async function getClientDaysThresholds() {
  try {
    const [rows] = await getPool().query("SELECT setting_value FROM system_settings WHERE setting_key = 'business_configuration'");
    if (rows.length > 0 && rows[0].setting_value?.client_settings) {
      return {
        active: parseInt(rows[0].setting_value.client_settings.active_days) || 30,
        regular: parseInt(rows[0].setting_value.client_settings.regular_days) || 90
      };
    }
  } catch (e) {}
  return { active: 30, regular: 90 };
}

// GET /clients - Retrieve list of clients (paginated, sorted, filtered)
router.get('/', requireAdminOrManager, async (req, res) => {
  const pool = getPool();
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const industry = req.query.industry || '';
    const statusFilter = req.query.status || ''; // Active, Regular, Inactive
    const sortKey = req.query.sortKey || 'company_name';
    const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const thresholds = await getClientDaysThresholds();

    // Query elements
    let query = `
      SELECT c.*, 
             MAX(t.created_at) as last_purchase_at,
             DATEDIFF(NOW(), MAX(t.created_at)) as days_since_last_purchase,
             COUNT(t.id) as total_orders,
             COALESCE(SUM(t.total_value), 0) as lifetime_revenue
      FROM clients c
      LEFT JOIN transactions t ON c.id = t.client_id AND t.type = 'OUTWARD'
      WHERE (c.company_name LIKE ? OR c.contact_person LIKE ? OR c.email LIKE ? OR c.city LIKE ?)
    `;
    const params = [search, search, search, search];

    if (industry) {
      query += ` AND c.industry = ?`;
      params.push(industry);
    }

    query += ` GROUP BY c.id`;

    // Dynamic calculated status filtering
    if (statusFilter) {
      if (statusFilter === 'Active') {
        query += ` HAVING days_since_last_purchase <= ?`;
        params.push(thresholds.active);
      } else if (statusFilter === 'Regular') {
        query += ` HAVING days_since_last_purchase > ? AND days_since_last_purchase <= ?`;
        params.push(thresholds.active, thresholds.regular);
      } else if (statusFilter === 'Inactive') {
        query += ` HAVING days_since_last_purchase > ? OR last_purchase_at IS NULL`;
        params.push(thresholds.regular);
      }
    }

    // Sorting overrides
    const allowedSortKeys = ['company_name', 'contact_person', 'city', 'industry', 'last_purchase_at', 'total_orders', 'lifetime_revenue'];
    const orderColumn = allowedSortKeys.includes(sortKey) ? sortKey : 'company_name';
    query += ` ORDER BY ${orderColumn} ${sortDir}`;

    // Pagination query
    const [countRows] = await pool.query(`SELECT COUNT(*) as count FROM (${query}) as countTable`, params);
    const totalCount = countRows[0]?.count || 0;

    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);

    // Map dynamic status tags
    const data = rows.map(row => {
      let status = 'Inactive';
      if (row.last_purchase_at) {
        const days = row.days_since_last_purchase;
        if (days <= thresholds.active) {
          status = 'Active';
        } else if (days <= thresholds.regular) {
          status = 'Regular';
        }
      }
      return { ...row, dynamic_status: status };
    });

    res.json({
      success: true,
      data,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching clients:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
});

// GET /clients/all - Export/Selector utility listing all clients without paging
router.get('/all', requireAdminOrManager, async (req, res) => {
  try {
    const thresholds = await getClientDaysThresholds();
    const [rows] = await getPool().query(`
      SELECT c.*, 
             MAX(t.created_at) as last_purchase_at,
             DATEDIFF(NOW(), MAX(t.created_at)) as days_since_last_purchase,
             COUNT(t.id) as total_orders,
             COALESCE(SUM(t.total_value), 0) as lifetime_revenue
      FROM clients c
      LEFT JOIN transactions t ON c.id = t.client_id AND t.type = 'OUTWARD'
      GROUP BY c.id
      ORDER BY c.company_name ASC
    `);

    const data = rows.map(row => {
      let status = 'Inactive';
      if (row.last_purchase_at) {
        const days = row.days_since_last_purchase;
        if (days <= thresholds.active) {
          status = 'Active';
        } else if (days <= thresholds.regular) {
          status = 'Regular';
        }
      }
      return { ...row, dynamic_status: status };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to export clients' });
  }
});

// GET /clients/analytics - Client dashboard analytics metrics & KPI summaries
router.get('/analytics', requireAdminOrManager, async (req, res) => {
  try {
    const pool = getPool();
    const thresholds = await getClientDaysThresholds();

    // KPI: total clients count
    const [totalRows] = await pool.query('SELECT COUNT(*) as count FROM clients');
    const totalClients = totalRows[0].count;

    // Get last purchase days for all clients to aggregate activity statuses
    const [statusRows] = await pool.query(`
      SELECT c.id, 
             DATEDIFF(NOW(), MAX(t.created_at)) as days_since_last_purchase,
             MAX(t.created_at) as last_purchase_at
      FROM clients c
      LEFT JOIN transactions t ON c.id = t.client_id AND t.type = 'OUTWARD'
      GROUP BY c.id
    `);

    let activeCount = 0;
    let regularCount = 0;
    let inactiveCount = 0;

    statusRows.forEach(row => {
      if (!row.last_purchase_at) {
        inactiveCount++;
      } else {
        const days = row.days_since_last_purchase;
        if (days <= thresholds.active) activeCount++;
        else if (days <= thresholds.regular) regularCount++;
        else inactiveCount++;
      }
    });

    // KPI: new clients this month
    const [newThisMonthRows] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM clients 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
    const newClientsThisMonth = newThisMonthRows[0].count;

    // KPI: total revenue & order details
    const [revenueRows] = await pool.query(`
      SELECT COUNT(*) as total_orders,
             COALESCE(SUM(total_value), 0) as lifetime_revenue,
             COALESCE(AVG(total_value), 0) as avg_order_value
      FROM transactions 
      WHERE type = 'OUTWARD' AND client_id IS NOT NULL
    `);
    const { total_orders, lifetime_revenue, avg_order_value } = revenueRows[0];

    // KPI: monthly revenue in last 30 days
    const [monthlyRevenueRows] = await pool.query(`
      SELECT COALESCE(SUM(total_value), 0) as revenue
      FROM transactions
      WHERE type = 'OUTWARD' AND client_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
    const revenueThisMonth = monthlyRevenueRows[0].revenue;

    // Chart data: Top purchasing clients (Revenue)
    const [topClientsRevenue] = await pool.query(`
      SELECT c.company_name, 
             COALESCE(SUM(t.total_value), 0) as value,
             COUNT(t.id) as orders
      FROM clients c
      JOIN transactions t ON c.id = t.client_id
      WHERE t.type = 'OUTWARD'
      GROUP BY c.id
      ORDER BY value DESC
      LIMIT 10
    `);

    // Chart data: Top purchasing clients (Frequency)
    const [topClientsOrders] = await pool.query(`
      SELECT c.company_name, 
             COUNT(t.id) as orders,
             COALESCE(SUM(t.total_value), 0) as value
      FROM clients c
      JOIN transactions t ON c.id = t.client_id
      WHERE t.type = 'OUTWARD'
      GROUP BY c.id
      ORDER BY orders DESC
      LIMIT 10
    `);

    // Chart data: Monthly sales trend (over last 6 months)
    const [monthlyTrend] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
             SUM(total_value) as revenue,
             COUNT(*) as orders
      FROM transactions
      WHERE type = 'OUTWARD' AND client_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `);

    res.json({
      success: true,
      data: {
        kpis: {
          totalClients,
          activeClients: activeCount,
          regularClients: regularCount,
          inactiveClients: inactiveCount,
          newClientsThisMonth,
          revenueThisMonth,
          lifetimeRevenue: lifetime_revenue,
          totalOrders: total_orders,
          averageOrderValue: avg_order_value
        },
        charts: {
          topClientsRevenue,
          topClientsOrders,
          monthlyTrend
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to compile client analytics' });
  }
});

// GET /clients/:id - Retrieve details of single client (including metrics and full purchase history)
router.get('/:id', requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  try {
    const thresholds = await getClientDaysThresholds();

    // 1. Fetch client base info + calculated summary KPI
    const [clientRows] = await pool.query(`
      SELECT c.*, 
             MAX(t.created_at) as last_purchase_at,
             DATEDIFF(NOW(), MAX(t.created_at)) as days_since_last_purchase,
             COUNT(t.id) as total_orders,
             COALESCE(SUM(t.total_value), 0) as lifetime_revenue,
             COALESCE(AVG(t.total_value), 0) as avg_order_value
      FROM clients c
      LEFT JOIN transactions t ON c.id = t.client_id AND t.type = 'OUTWARD'
      WHERE c.id = ?
      GROUP BY c.id
    `, [id]);

    if (clientRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const client = clientRows[0];
    let status = 'Inactive';
    if (client.last_purchase_at) {
      const days = client.days_since_last_purchase;
      if (days <= thresholds.active) {
        status = 'Active';
      } else if (days <= thresholds.regular) {
        status = 'Regular';
      }
    }
    client.dynamic_status = status;

    // 2. Fetch client purchase timeline (recent 25 outward logs)
    const [purchases] = await pool.query(`
      SELECT t.id, t.created_at as date, t.quantity, t.unit_price, t.total_value, 
             p.product_name, p.model_no, w.name as warehouse_name
      FROM transactions t
      JOIN products p ON t.product_id = p.id
      JOIN warehouses w ON t.warehouse_id = w.id
      WHERE t.client_id = ? AND t.type = 'OUTWARD'
      ORDER BY t.created_at DESC
      LIMIT 25
    `, [id]);

    // 3. Fetch popular products purchased by this client
    const [popularProducts] = await pool.query(`
      SELECT p.product_name, p.model_no, 
             SUM(t.quantity) as total_qty,
             SUM(t.total_value) as total_spent
      FROM transactions t
      JOIN products p ON t.product_id = p.id
      WHERE t.client_id = ? AND t.type = 'OUTWARD'
      GROUP BY p.id
      ORDER BY total_qty DESC
      LIMIT 10
    `, [id]);

    // 4. Fetch monthly purchase trend (sales history in currency)
    const [monthlySpend] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
             SUM(total_value) as value,
             COUNT(*) as orders
      FROM transactions
      WHERE client_id = ? AND type = 'OUTWARD'
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12
    `, [id]);

    res.json({
      success: true,
      data: {
        client,
        purchases,
        popularProducts,
        monthlySpend
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to retrieve client details' });
  }
});

// POST /clients - Add single client record manually
router.post('/', requireAdminOrManager, async (req, res) => {
  const { company_name, contact_person, phone, email, address, city, state, industry, remarks } = req.body;
  if (!company_name || company_name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Company Name is required and must be at least 2 characters.' });
  }
  if (!contact_person || contact_person.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Contact Person is required and must be at least 2 characters.' });
  }
  if (!phone || !validatePhone(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone number. Must contain 7 to 15 digits (digits and optional leading + only).' });
  }
  let sanitizedEmail = null;
  if (email && email.trim() !== '') {
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }
    sanitizedEmail = sanitizeEmail(email);
  }

  const pool = getPool();
  try {
    // Check if company exists
    const [exists] = await pool.query('SELECT id FROM clients WHERE company_name = ?', [company_name.trim()]);
    if (exists.length > 0) {
      return res.status(400).json({ success: false, message: 'A client with this Company Name already exists' });
    }

    const [result] = await pool.query(`
      INSERT INTO clients (company_name, contact_person, phone, email, address, city, state, industry, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_name.trim(),
      contact_person.trim(),
      phone.trim(),
      sanitizedEmail,
      address ? address.trim() : null,
      city ? city.trim() : null,
      state ? state.trim() : null,
      industry ? industry.trim() : null,
      remarks ? remarks.trim() : null
    ]);

    const newId = result.insertId;

    await logAction(req, {
      module: 'Client Management',
      action: 'CREATE_CLIENT',
      reference_type: 'clients',
      reference_id: newId,
      old_value: null,
      new_value: { company_name, contact_person, email: sanitizedEmail },
      description: `Created client account: ${company_name}`
    });

    res.status(201).json({ success: true, message: 'Client created successfully', data: { id: newId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to create client' });
  }
});

// PUT /clients/:id - Edit client details
router.put('/:id', requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const { company_name, contact_person, phone, email, address, city, state, industry, remarks } = req.body;
  if (!company_name || company_name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Company Name is required and must be at least 2 characters.' });
  }
  if (!contact_person || contact_person.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Contact Person is required and must be at least 2 characters.' });
  }
  if (!phone || !validatePhone(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone number. Must contain 7 to 15 digits.' });
  }
  let sanitizedEmail = null;
  if (email && email.trim() !== '') {
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }
    sanitizedEmail = sanitizeEmail(email);
  }

  const pool = getPool();
  try {
    const [exists] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    const oldClient = exists[0];

    // Check duplicate name
    const [duplicate] = await pool.query('SELECT id FROM clients WHERE company_name = ? AND id != ?', [company_name.trim(), id]);
    if (duplicate.length > 0) {
      return res.status(400).json({ success: false, message: 'Another client is already named this' });
    }

    await pool.query(`
      UPDATE clients 
      SET company_name = ?, contact_person = ?, phone = ?, email = ?, 
          address = ?, city = ?, state = ?, industry = ?, remarks = ?
      WHERE id = ?
    `, [
      company_name.trim(),
      contact_person.trim(),
      phone.trim(),
      sanitizedEmail,
      address ? address.trim() : null,
      city ? city.trim() : null,
      state ? state.trim() : null,
      industry ? industry.trim() : null,
      remarks ? remarks.trim() : null,
      id
    ]);

    await logAction(req, {
      module: 'Client Management',
      action: 'UPDATE_CLIENT',
      reference_type: 'clients',
      reference_id: id,
      old_value: oldClient,
      new_value: { company_name, contact_person, email },
      description: `Updated client details for ${company_name}`
    });

    res.json({ success: true, message: 'Client updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update client' });
  }
});

// DELETE /clients/:id - Remove client record
router.delete('/:id', requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  try {
    const [exists] = await pool.query('SELECT company_name FROM clients WHERE id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    await pool.query('DELETE FROM clients WHERE id = ?', [id]);

    await logAction(req, {
      module: 'Client Management',
      action: 'DELETE_CLIENT',
      reference_type: 'clients',
      reference_id: id,
      old_value: { company_name: exists[0].company_name },
      new_value: null,
      description: `Removed client record: ${exists[0].company_name}`
    });

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete client' });
  }
});

// POST /clients/import - Bulk import clients via JSON array
router.post('/import', requireAdminOrManager, async (req, res) => {
  const { clients } = req.body;
  if (!clients || !Array.isArray(clients)) {
    return res.status(400).json({ success: false, message: 'Valid clients array is required' });
  }
  const pool = getPool();
  const conn = await pool.getConnection();

  let imported = 0;
  let skipped = 0;
  const errors = [];

  try {
    await conn.beginTransaction();

    for (const c of clients) {
      if (!c.company_name) {
        skipped++;
        errors.push(`Skipped row: Missing Company Name`);
        continue;
      }

      // Check duplicate
      const [exists] = await conn.query('SELECT id FROM clients WHERE company_name = ?', [c.company_name.trim()]);
      if (exists.length > 0) {
        skipped++;
        errors.push(`Skipped "${c.company_name.trim()}": Client already exists`);
        continue;
      }

      await conn.query(`
        INSERT INTO clients (company_name, contact_person, phone, email, gst, address, city, state, industry, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        c.company_name.trim(),
        c.contact_person ? String(c.contact_person).trim() : null,
        c.phone ? String(c.phone).trim() : null,
        c.email ? String(c.email).trim() : null,
        c.gst ? String(c.gst).trim().toUpperCase() : null,
        c.address ? String(c.address).trim() : null,
        c.city ? String(c.city).trim() : null,
        c.state ? String(c.state).trim() : null,
        c.industry ? String(c.industry).trim() : null,
        c.remarks ? String(c.remarks).trim() : null
      ]);
      imported++;
    }

    await conn.commit();

    await logAction(req, {
      module: 'Client Management',
      action: 'BULK_IMPORT_CLIENTS',
      reference_type: 'clients',
      reference_id: null,
      old_value: null,
      new_value: { count: imported },
      description: `Bulk imported ${imported} clients. Skipped ${skipped} entries.`
    });

    res.json({ success: true, message: `Successfully imported ${imported} clients. Skipped ${skipped}.`, errors });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'Database import transaction failed' });
  } finally {
    conn.release();
  }
});

module.exports = router;
