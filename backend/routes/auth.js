const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const { getPool } = require('../db');
const { sendMail } = require('../utils/mailer');

const backendClientId = process.env.GOOGLE_CLIENT_ID || 'placeholder';
console.log("⚡ [Backend] Initializing OAuth2Client with Client ID:", backendClientId);

if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'placeholder') {
  console.warn("⚠️ [Backend] WARNING: GOOGLE_CLIENT_ID is missing or 'placeholder'. Validations will fail with 'invalid_client' or mismatch errors.");
}

const googleClient = new OAuth2Client(backendClientId);

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const [rows] = await getPool().query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(401).json({ message: 'Account is disabled. Please contact the administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate random 6 digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  try {
    const [rows] = await getPool().query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    await getPool().query(
      'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    try {
      await sendMail({
        to: email,
        subject: "Password Reset OTP",
        text: `Your OTP is: ${otp}\nIt expires in 10 minutes.`
      });
      console.log(`📧 OTP Email sent successfully to ${email}`);
      res.json({ message: 'OTP sent to email successfully.' });
    } catch (emailErr) {
      console.error("❌ Email sending failed:", emailErr.message);
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

  try {
    const [rows] = await getPool().query(
      'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Email, OTP, and new password required' });

  try {
    const [rows] = await getPool().query(
      'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await getPool().query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

    // Cleanup used OTPs
    await getPool().query('DELETE FROM password_resets WHERE email = ?', [email]);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/google-login', async (req, res) => {
  const { credential, accessToken } = req.body;
  
  console.log(`\n🔵 [Backend] POST /google-login hit.`);
  console.log(`🔵 [Backend] Request contains credential (ID token): ${!!credential}, accessToken: ${!!accessToken}`);

  if (!credential && !accessToken) {
    console.error("🔴 [Backend] Error: No credential or accessToken provided in request.");
    return res.status(400).json({ message: 'No credential or accessToken provided in request body' });
  }

  // Prevent placeholder validation matching which might cause unclear trace
  if (process.env.GOOGLE_CLIENT_ID === 'placeholder') {
     console.error("🔴 [Backend] Error: GOOGLE_CLIENT_ID environment variable is set to 'placeholder'. Authentication aborted.");
     return res.status(500).json({ message: 'Backend configuration error: GOOGLE_CLIENT_ID is unset (placeholder).' });
  }

  try {
    let email, google_id, name, picture;

    if (credential) {
      console.log("🔵 [Backend] Verifying ID Token via verifyIdToken...");
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      console.log("🟢 [Backend] ID Token verified successfully. Payload audience:", payload.aud);
      
      if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
         console.warn("⚠️ [Backend] Audience mismatch detected. token aud != GOOGLE_CLIENT_ID");
      }

      email = payload.email;
      google_id = payload.sub;
      name = payload.name;
      picture = payload.picture;
    } else {
      // Use access token to get user info
      console.log("🔵 [Backend] Verifying Access Token via userinfo endpoint...");
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error("🔴 [Backend] Google API rejected access token. Status:", userInfoResponse.status, "Error:", errorText);
        throw new Error(`Invalid Google access token. API responded with ${userInfoResponse.status}: ${errorText}`);
      }
      
      const payload = await userInfoResponse.json();
      console.log("🟢 [Backend] Access Token verified successfully. User Info:", payload.email, payload.sub);
      
      email = payload.email;
      google_id = payload.sub;
      name = payload.name;
      picture = payload.picture;
    }

    if (!email) {
      console.error("🔴 [Backend] Failed to extract email from Google payload. Payload didn't include email.");
      return res.status(400).json({ message: 'Google payload did not return an email address. Scope might be missing.' });
    }

    console.log(`🔵 [Backend] Looking up user by email: ${email}`);
    const [rows] = await getPool().query('SELECT * FROM users WHERE email = ?', [email]);
    
    let user;
    if (rows.length > 0) {
      user = rows[0];
      console.log("🟢 [Backend] User exists. Updating missing tracking variables...");
      // User exists. Update missing google auth details if they aren't set
      if (!user.google_id || !user.name || !user.profile_image) {
        await getPool().query(
          'UPDATE users SET google_id = COALESCE(google_id, ?), name = COALESCE(name, ?), profile_image = COALESCE(profile_image, ?) WHERE email = ?',
          [google_id, name, picture, email]
        );
        // Refresh user obj
        const [updatedRows] = await getPool().query('SELECT * FROM users WHERE email = ?', [email]);
        user = updatedRows[0];
      }
      
      if (!user.is_active) {
        console.warn(`⚠️ [Backend] User ${email} account is disabled.`);
        return res.status(401).json({ message: 'Account is disabled. Please contact the administrator.' });
      }
    } else {
      console.log("🔵 [Backend] User does not exist. Gracefully provisioning new basic account.");
      const defaultRole = 'Basic User';
      const [insertResult] = await getPool().query(
        'INSERT INTO users (email, google_id, name, profile_image, role, is_active, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [email, google_id, name, picture, defaultRole, true, true]
      );
      
      const insertId = insertResult.insertId;
      const [newRows] = await getPool().query('SELECT * FROM users WHERE id = ?', [insertId]);
      user = newRows[0];
      console.log(`🟢 [Backend] Account created successfully for ${email}.`);
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1d' }
    );

    console.log("🟢 [Backend] Authentication flow completed successfully. Dispatching token.");
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        profile_image: user.profile_image
      }
    });
  } catch (err) {
    console.error("🔴 [Backend] Global block Google Auth Error caught:");
    console.error(err);
    // Send specific error message back to frontend so they don't get generic 500 error
    const msg = err.message ? err.message : 'Unknown authentication failure';
    if (msg.includes('invalid_client')) {
       return res.status(401).json({ message: 'Google Client ID verification failed (invalid_client).' });
    }
    res.status(500).json({ message: `Google authentication failed: ${msg}` });
  }
});

module.exports = router;