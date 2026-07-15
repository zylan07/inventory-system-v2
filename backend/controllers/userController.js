const { getPool } = require('../db');
const bcrypt = require('bcrypt');
const { logAction } = require('../utils/auditLogger');

const getAllUsers = async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  const { email, password, role, is_active } = req.body;
  try {
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    const [existing] = await getPool().query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const activeStatus = is_active !== undefined ? is_active : true;

    const [result] = await getPool().query(
      'INSERT INTO users (email, password, role, is_active) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, role, activeStatus]
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
  const { role, is_active, password } = req.body;

  try {
    const [userRows] = await getPool().query('SELECT id, email, role, is_active FROM users WHERE id = ?', [id]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const oldUser = userRows[0];

    let query = 'UPDATE users SET role = ?, is_active = ?';
    let params = [role, is_active];

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

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser
};
