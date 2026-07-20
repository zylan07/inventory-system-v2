const { getPool } = require('../db');
const bcrypt = require('bcrypt');
const { logAction } = require('../utils/auditLogger');
const { validateEmail, sanitizeEmail } = require('../utils/validators');

const getAllUsers = async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, email, role, is_active, purchase_team, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  const { email, password, role, is_active, purchase_team } = req.body;
  try {
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address format' });
    }
    const sanitizedEmail = sanitizeEmail(email);

    const [existing] = await getPool().query('SELECT * FROM users WHERE email = ?', [sanitizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const activeStatus = is_active !== undefined ? is_active : true;
    const isPurchaseTeam = purchase_team !== undefined ? !!purchase_team : false;

    const [result] = await getPool().query(
      'INSERT INTO users (email, password, role, is_active, purchase_team) VALUES (?, ?, ?, ?, ?)',
      [sanitizedEmail, hashedPassword, role, activeStatus, isPurchaseTeam]
    );

    const newUserId = result.insertId;

    await logAction(req, {
      module: 'User Management',
      action: 'CREATE_USER',
      reference_type: 'users',
      reference_id: newUserId,
      old_value: null,
      new_value: { email, role, is_active: activeStatus },
      description: `Created new user account: ${email} with role: ${role}.`
    });

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { role, is_active, password, purchase_team } = req.body;

  try {
    const [userRows] = await getPool().query('SELECT id, email, role, is_active, purchase_team FROM users WHERE id = ?', [id]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const oldUser = userRows[0];

    let query = 'UPDATE users SET role = ?, is_active = ?';
    let params = [role, is_active];

    if (purchase_team !== undefined) {
      query += ', purchase_team = ?';
      params.push(!!purchase_team);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await getPool().query(query, params);

    // Determine specific action type for audit logging
    let action = 'EDIT_USER';
    if (oldUser.role !== role) {
      action = 'ROLE_CHANGED';
    } else if (oldUser.is_active !== is_active) {
      action = is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER';
    }

    await logAction(req, {
      module: 'User Management',
      action,
      reference_type: 'users',
      reference_id: id,
      old_value: { role: oldUser.role, is_active: oldUser.is_active },
      new_value: { role, is_active },
      description: `Updated details for user ${oldUser.email}.`
    });
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const [userRows] = await getPool().query('SELECT email, role, is_active FROM users WHERE id = ?', [id]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const oldUser = userRows[0];

    await getPool().query('DELETE FROM users WHERE id = ?', [id]);

    await logAction(req, {
      module: 'User Management',
      action: 'DELETE_USER',
      reference_type: 'users',
      reference_id: id,
      old_value: oldUser,
      new_value: null,
      description: `Deleted user account ${oldUser.email}.`
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPurchaseRecipients = async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT id, email, name, is_active, notes, created_at FROM purchase_team_recipients ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPurchaseRecipient = async (req, res) => {
  const { email, name, is_active, notes } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address format' });
    }
    const sanitizedEmail = sanitizeEmail(email);
    const trimmedName = name ? name.trim() : null;
    const activeStatus = is_active !== undefined ? !!is_active : true;
    const notesVal = notes ? notes.trim() : null;

    // Check duplicates
    const [existing] = await getPool().query('SELECT id FROM purchase_team_recipients WHERE email = ?', [sanitizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Recipient with this email already exists' });
    }

    await getPool().query(
      'INSERT INTO purchase_team_recipients (email, name, is_active, notes) VALUES (?, ?, ?, ?)',
      [sanitizedEmail, trimmedName, activeStatus, notesVal]
    );

    res.status(201).json({ message: 'Recipient created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePurchaseRecipient = async (req, res) => {
  const { id } = req.params;
  const { email, name, is_active, notes } = req.body;
  try {
    const [existing] = await getPool().query('SELECT * FROM purchase_team_recipients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    const oldRecipient = existing[0];

    let sanitizedEmail = oldRecipient.email;
    if (email && email !== oldRecipient.email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email address format' });
      }
      sanitizedEmail = sanitizeEmail(email);
      // Check uniqueness on other records
      const [duplicate] = await getPool().query('SELECT id FROM purchase_team_recipients WHERE email = ? AND id != ?', [sanitizedEmail, id]);
      if (duplicate.length > 0) {
        return res.status(400).json({ message: 'Another recipient with this email already exists' });
      }
    }

    const trimmedName = name !== undefined ? (name ? name.trim() : null) : oldRecipient.name;
    const activeStatus = is_active !== undefined ? !!is_active : oldRecipient.is_active;
    const notesVal = notes !== undefined ? (notes ? notes.trim() : null) : oldRecipient.notes;

    await getPool().query(
      'UPDATE purchase_team_recipients SET email = ?, name = ?, is_active = ?, notes = ? WHERE id = ?',
      [sanitizedEmail, trimmedName, activeStatus, notesVal, id]
    );

    res.json({ message: 'Recipient updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deletePurchaseRecipient = async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await getPool().query('SELECT * FROM purchase_team_recipients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    await getPool().query('DELETE FROM purchase_team_recipients WHERE id = ?', [id]);
    res.json({ message: 'Recipient deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getPurchaseRecipients,
  createPurchaseRecipient,
  updatePurchaseRecipient,
  deletePurchaseRecipient
};
