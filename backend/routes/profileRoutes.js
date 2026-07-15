const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../db');

const { logAction } = require('../utils/auditLogger');

// Multer memory storage configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB Limit
});

// Helper: check if file type is allowed
const isAllowedMimeType = (mime) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return allowed.includes(mime.toLowerCase());
};

// Helper: check file extension
const isAllowedExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  return allowed.includes(ext);
};

// GET /profile - Fetch current user's profile details
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await getPool().query(
      'SELECT id, email, name, profile_image, role, is_active, google_id, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = rows[0];
    res.json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// PUT /profile - Update Name and/or Profile Picture
router.put('/', upload.single('avatar'), async (req, res) => {
  const userId = req.user.id;
  const name = req.body.name ? req.body.name.trim() : null;
  const removeAvatar = req.body.removeAvatar === 'true';

  if (!name) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  try {
    // 1. Get current user profile details
    const [rows] = await getPool().query('SELECT id, name, profile_image FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = rows[0];
    let newProfileImageUrl = user.profile_image;

    // 2. Handle Profile Picture Removal or Update
    const userDir = path.join('./uploads', 'profile', `user_${userId}`);

    if (removeAvatar) {
      // Clear custom avatar
      if (user.profile_image && user.profile_image.startsWith('/uploads/')) {
        const relativePath = user.profile_image.replace(/^\//, ''); // strip leading slash
        const fullPath = path.join('.', relativePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
      newProfileImageUrl = null;
    } else if (req.file) {
      // Validate MIME type
      if (!isAllowedMimeType(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Only JPG, JPEG, PNG, and WEBP formats are allowed.' });
      }
      // Validate Extension
      if (!isAllowedExtension(req.file.originalname)) {
        return res.status(400).json({ success: false, message: 'Invalid file extension.' });
      }

      // Ensure user-specific directory exists
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      // Delete existing custom images inside directory
      const files = fs.readdirSync(userDir);
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(userDir, f));
        } catch (e) { }
      });

      // Save new file
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname).toLowerCase();
      const newFilename = `avatar_${timestamp}${ext}`;
      const savePath = path.join(userDir, newFilename);
      fs.writeFileSync(savePath, req.file.buffer);

      // Save relative url format
      newProfileImageUrl = `/uploads/profile/user_${userId}/${newFilename}`;
    }

    // 3. Update database
    await getPool().query(
      'UPDATE users SET name = ?, profile_image = ? WHERE id = ?',
      [name, newProfileImageUrl, userId]
    );

    // Write audit log
    await logAction(req, {
      module: 'Profile',
      action: 'UPDATE_PROFILE',
      reference_type: 'users',
      reference_id: userId,
      old_value: { name: user.name, profile_image: user.profile_image },
      new_value: { name, profile_image: newProfileImageUrl },
      description: `User updated account profile information.`
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { name, profile_image: newProfileImageUrl }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// DELETE /profile/avatar - Remove profile picture endpoint
router.delete('/avatar', async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await getPool().query('SELECT profile_image FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = rows[0];

    if (user.profile_image && user.profile_image.startsWith('/uploads/')) {
      const relativePath = user.profile_image.replace(/^\//, '');
      const fullPath = path.join('.', relativePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await getPool().query('UPDATE users SET profile_image = NULL WHERE id = ?', [userId]);

    await logAction(req, {
      module: 'Profile',
      action: 'REMOVE_AVATAR',
      reference_type: 'users',
      reference_id: userId,
      old_value: { profile_image: user.profile_image },
      new_value: { profile_image: null },
      description: 'User removed account avatar picture.'
    });

    res.json({ success: true, message: 'Profile picture removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to remove picture' });
  }
});

// PUT /profile/password - Change local password
const handlePasswordUpdate = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
  }

  try {
    const [rows] = await getPool().query('SELECT password, google_id FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = rows[0];

    if (user.google_id && !user.password) {
      return res.status(400).json({ success: false, message: 'Password is managed through Google Account.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      await logAction(req, {
        module: 'Profile',
        action: 'FAILED_PASSWORD_CHANGE',
        reference_type: 'users',
        reference_id: userId,
        old_value: null,
        new_value: null,
        description: 'Failed password update: incorrect current credentials input.',
        status: 'FAILED'
      });
      return res.status(400).json({ success: false, message: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await getPool().query('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);

    await logAction(req, {
      module: 'Profile',
      action: 'CHANGE_PASSWORD',
      reference_type: 'users',
      reference_id: userId,
      old_value: null,
      new_value: null,
      description: 'Successfully updated security account password.'
    });

    res.json({ success: true, message: 'Password changed successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

router.post('/password', handlePasswordUpdate);
router.put('/password', handlePasswordUpdate);

module.exports = router;
