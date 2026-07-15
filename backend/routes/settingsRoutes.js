const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../db');
const { requireAdmin } = require('../middleware/authMiddleware');
const { logAction } = require('../utils/auditLogger');

// Multer memory storage configuration for logo uploading
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

// Shared Database Operation Lock
let isDbOperationLocked = false;

// GET /settings - Fetch all system settings keys
router.get('/', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM system_settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.setting_key] = r.setting_value;
    });
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('Failed to fetch settings:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

// PUT /settings/:key - Save specific settings card
router.put('/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const newValue = req.body;
  const pool = getPool();

  try {
    // 1. Fetch current settings JSON to extract version metadata
    const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
    let currentVal = rows.length > 0 ? rows[0].setting_value : {};
    let version = 1;
    if (currentVal && currentVal.versionMetadata) {
      version = (parseInt(currentVal.versionMetadata.version) || 0) + 1;
    }

    // 2. Fetch admin user name
    const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const adminName = uRows.length > 0 ? uRows[0].name : req.user.email;

    // Attach version metadata
    newValue.versionMetadata = {
      version,
      updatedBy: `${adminName} (${req.user.email})`,
      updatedAt: new Date().toISOString()
    };

    // 3. Update database
    await pool.query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [key, JSON.stringify(newValue), JSON.stringify(newValue)]
    );

    // 4. Log changes using centralized logger
    await logAction(req, {
      module: 'Settings',
      action: 'UPDATE_SETTINGS',
      reference_type: 'setting_key',
      reference_id: key,
      old_value: currentVal,
      new_value: newValue,
      description: `Updated configuration settings card for ${key} to version ${version}.`
    });

    res.json({ success: true, message: `${key} settings updated successfully`, data: newValue });

  } catch (err) {
    console.error(`Failed to update ${key} settings:`, err.message);
    res.status(500).json({ success: false, message: `Failed to update ${key} settings` });
  }
});

// POST /settings/logo - Upload company branding logo
router.post('/logo', requireAdmin, upload.single('logo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No logo file provided' });
  }

  const pool = getPool();

  try {
    // Validate MIME type
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(req.file.mimetype.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Only PNG, JPEG, and WEBP logo images are allowed.' });
    }

    const brandingDir = path.join('./uploads', 'branding');
    if (!fs.existsSync(brandingDir)) {
      fs.mkdirSync(brandingDir, { recursive: true });
    }

    // 1. Fetch current logo url
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'company_info'");
    const info = rows.length > 0 ? rows[0].setting_value : {};
    const oldLogo = info.logoUrl;

    // Delete previous logo file from disk if it exists
    if (oldLogo && oldLogo.startsWith('/uploads/branding/')) {
      const relativePath = oldLogo.replace(/^\//, '');
      const fullPath = path.join('.', relativePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {}
      }
    }

    // Save new file with unique timestamp filename
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.png', '.jpeg', '.jpg', '.webp'];
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ success: false, message: 'Only PNG, JPEG, and WEBP logo images are allowed.' });
    }
    const newFilename = `logo_${timestamp}${ext}`;
    const savePath = path.join(brandingDir, newFilename);
    fs.writeFileSync(savePath, req.file.buffer);

    const newLogoUrl = `/uploads/branding/${newFilename}`;

    // 2. Fetch admin user full name
    const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const adminName = uRows.length > 0 ? uRows[0].name : req.user.email;

    const oldVersion = info.versionMetadata ? info.versionMetadata.version : 0;
    const newInfo = {
      name: info.name || 'INVENTRA',
      logoUrl: newLogoUrl,
      versionMetadata: {
        version: oldVersion + 1,
        updatedBy: `${adminName} (${req.user.email})`,
        updatedAt: new Date().toISOString()
      }
    };

    // Update settings in database
    await pool.query(
      "INSERT INTO system_settings (setting_key, setting_value) VALUES ('company_info', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [JSON.stringify(newInfo), JSON.stringify(newInfo)]
    );

    // 3. Log actions
    await logAction(req, {
      module: 'Branding',
      action: 'CHANGE_LOGO',
      reference_type: 'logo_url',
      reference_id: newLogoUrl,
      old_value: { logoUrl: oldLogo },
      new_value: { logoUrl: newLogoUrl },
      description: `Uploaded and replaced company branding logo file.`
    });

    res.json({ success: true, logoUrl: newLogoUrl, companyInfo: newInfo });

  } catch (err) {
    console.error('Logo upload failed:', err.message);
    res.status(500).json({ success: false, message: 'Logo upload failed' });
  }
});

// DELETE /settings/logo - Remove company logo
router.delete('/logo', requireAdmin, async (req, res) => {
  const pool = getPool();
  try {
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'company_info'");
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Settings not initialized' });
    }
    const info = rows[0].setting_value;
    const oldLogo = info.logoUrl;

    if (oldLogo && oldLogo.startsWith('/uploads/branding/')) {
      const relativePath = oldLogo.replace(/^\//, '');
      const fullPath = path.join('.', relativePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {}
      }
    }

    // Update config
    const oldVersion = info.versionMetadata ? info.versionMetadata.version : 0;
    const newInfo = {
      name: info.name || 'INVENTRA',
      logoUrl: null,
      versionMetadata: {
        version: oldVersion + 1,
        updatedBy: req.user.email,
        updatedAt: new Date().toISOString()
      }
    };

    await pool.query("UPDATE system_settings SET setting_value = ? WHERE setting_key = 'company_info'", [JSON.stringify(newInfo)]);

    await logAction(req, {
      module: 'Branding',
      action: 'REMOVE_LOGO',
      reference_type: 'logo_url',
      reference_id: null,
      old_value: { logoUrl: oldLogo },
      new_value: { logoUrl: null },
      description: `Removed company branding logo file.`
    });

    res.json({ success: true, companyInfo: newInfo });
  } catch (err) {
    console.error('Failed to remove logo:', err.message);
    res.status(500).json({ success: false, message: 'Failed to remove logo' });
  }
});

// POST /settings/backup - Create structured database backup returned in response
router.post('/backup', requireAdmin, async (req, res) => {
  if (isDbOperationLocked) {
    return res.status(409).json({ success: false, message: 'Another database backup or restore operation is currently in progress. Please try again later.' });
  }

  isDbOperationLocked = true;
  const pool = getPool();

  try {
    // 1. Fetch Admin creator name
    const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const adminName = uRows.length > 0 ? uRows[0].name : req.user.email;

    // 2. Map database table records
    const tables = ['users', 'products', 'warehouses', 'stock', 'transactions', 'system_settings'];
    const backupData = {};
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      backupData[table] = rows;
    }

    // 3. Compile backup JSON payload
    const backupPayload = {
      metadata: {
        created_by_name: adminName,
        created_by_email: req.user.email,
        app_version: '1.4.0',
        schema_version: '1.2.0',
        backup_version: '1.0.0',
        created_at: new Date().toISOString()
      },
      data: backupData
    };

    // Log backup creation
    await logAction(req, {
      module: 'Settings',
      action: 'CREATE_BACKUP',
      reference_type: 'backup_action',
      reference_id: 'generate',
      old_value: null,
      new_value: null,
      description: `Generated structured inventory database backup package.`
    });

    res.json({ success: true, data: backupPayload });

  } catch (err) {
    console.error('Backup creation failed:', err.message);
    res.status(500).json({ success: false, message: 'Backup creation failed: ' + err.message });
  } finally {
    isDbOperationLocked = false;
  }
});

// POST /settings/restore - Upload and restore database backup with recovery checks
router.post('/restore', requireAdmin, upload.single('backupFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No backup file provided' });
  }

  if (isDbOperationLocked) {
    return res.status(409).json({ success: false, message: 'Another database backup or restore operation is currently in progress. Please try again later.' });
  }

  isDbOperationLocked = true;
  const pool = getPool();

  // Create temporary in-memory rollback backup
  let tempRollbackBackup = {};
  const tables = ['users', 'products', 'warehouses', 'stock', 'transactions', 'system_settings'];

  try {
    // 1. Parse upload payload
    let backupPayload;
    try {
      backupPayload = JSON.parse(req.file.buffer.toString());
    } catch (e) {
      throw new Error('Invalid JSON file format.');
    }

    if (!backupPayload.metadata || !backupPayload.data) {
      throw new Error('Upload file is not a valid Inventory Backup package.');
    }

    // Schema version checks
    if (!backupPayload.metadata.schema_version || backupPayload.metadata.schema_version !== '1.2.0') {
      throw new Error('Restore rejected: Unsupported database schema version.');
    }

    // Expected tables only checks
    const expectedTables = ['users', 'products', 'warehouses', 'stock', 'transactions', 'system_settings'];
    const uploadedTables = Object.keys(backupPayload.data);
    for (const tbl of uploadedTables) {
      if (!expectedTables.includes(tbl)) {
        throw new Error('Restore rejected: Unknown table in backup package: ' + tbl);
      }
    }

    // Expected columns only checks
    const validColumns = {
      users: ['id', 'email', 'password', 'name', 'role', 'google_id', 'created_at'],
      products: ['id', 'group_name', 'product_name', 'model_no', 'unit', 'description', 'min_stock', 'created_at'],
      warehouses: ['id', 'name'],
      stock: ['id', 'product_id', 'warehouse_id', 'quantity', 'alert_sent'],
      transactions: ['id', 'type', 'product_id', 'quantity', 'warehouse_id', 'from_warehouse_id', 'to_warehouse_id', 'user_email', 'narration', 'created_at'],
      system_settings: ['setting_key', 'setting_value', 'updated_at']
    };

    for (const tbl of uploadedTables) {
      const rows = backupPayload.data[tbl];
      if (!rows || !Array.isArray(rows)) continue;
      for (const row of rows) {
        const keys = Object.keys(row);
        for (const key of keys) {
          if (!validColumns[tbl].includes(key)) {
            throw new Error(`Restore rejected: Invalid column '${key}' in table '${tbl}'.`);
          }
        }
      }
    }

    // 2. Perform in-memory rollback snapshot
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      tempRollbackBackup[table] = rows;
    }

    // 3. Rebuild Database (Truncate tables and insert restore data)
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of tables) {
        await pool.query(`TRUNCATE TABLE ${table}`);
      }

      for (const table of tables) {
        const rows = backupPayload.data[table];
        if (!rows || rows.length === 0) continue;

        for (const row of rows) {
          const keys = Object.keys(row);
          for (const key of keys) {
            if (!/^[a-zA-Z0-9_]+$/.test(key)) {
              throw new Error('Invalid column name: ' + key);
            }
          }
          const values = Object.values(row);
          const placeholders = keys.map(() => '?').join(', ');
          await pool.query(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
        }
      }
    } catch (restoreErr) {
      // Trigger database rollback on SQL insert crashes
      console.error('Restore insertion crashed. Initiating rollback...', restoreErr.message);
      for (const table of tables) {
        await pool.query(`TRUNCATE TABLE ${table}`);
      }
      for (const table of tables) {
        const rows = tempRollbackBackup[table];
        if (!rows || rows.length === 0) continue;
        for (const row of rows) {
          const keys = Object.keys(row);
          for (const key of keys) {
            if (!/^[a-zA-Z0-9_]+$/.test(key)) {
              throw new Error('Invalid column name: ' + key);
            }
          }
          const values = Object.values(row);
          const placeholders = keys.map(() => '?').join(', ');
          await pool.query(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
        }
      }
      throw new Error('Restore insertion failed: ' + restoreErr.message + '. Database rolled back safely.');
    } finally {
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    // 4. Verify database state
    const [testCount] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (testCount[0].count === 0) {
      throw new Error('Restore validation failed: no users found in restore file.');
    }

    // 5. Log restore event
    await logAction(req, {
      module: 'Settings',
      action: 'RESTORE_BACKUP',
      reference_type: 'restore_source',
      reference_id: req.file.originalname,
      old_value: null,
      new_value: { filename: req.file.originalname, metadata: backupPayload.metadata },
      description: `Restored inventory database configuration from: ${req.file.originalname}`
    });

    res.json({ success: true, message: 'Database restored successfully' });

  } catch (err) {
    console.error('Database restore failed:', err.message);
    res.status(500).json({ success: false, message: 'Database restore failed: ' + err.message });
  } finally {
    isDbOperationLocked = false;
  }
});

module.exports = router;
