const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');

const path = require('path');
const productRoutes = require('./routes/productRoutes');
const stockRoutes = require('./routes/stockRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const clientRoutes = require('./routes/clientRoutes');
const purchaseQueueRoutes = require('./routes/purchaseQueueRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const { authMiddleware } = require('./middleware/authMiddleware');
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public routes
app.use('/auth', authRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected Routes
app.use('/users', authMiddleware, userRoutes);
app.use('/products', authMiddleware, productRoutes);
app.use('/stock', authMiddleware, stockRoutes);
app.use('/transactions', authMiddleware, transactionRoutes);
app.use('/notifications', authMiddleware, notificationRoutes);
app.use('/profile', authMiddleware, profileRoutes);
app.use('/settings', authMiddleware, settingsRoutes);
app.use('/clients', authMiddleware, clientRoutes);
app.use('/purchase-queue', authMiddleware, purchaseQueueRoutes);
app.use('/warehouses', authMiddleware, warehouseRoutes);

const PORT = process.env.PORT || 5000;

const { getTransporter } = require('./utils/mailer');

initDb().then(async () => {
  // Log SMTP environment parameters safely on startup
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  console.log(`EMAIL_USER: ${user}`);
  console.log(`EMAIL_PASS exists: ${!!pass}`);
  console.log(`EMAIL_PASS length: ${pass ? pass.length : 0}`);

  // Verify SMTP connection on startup
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');
  } catch (err) {
    console.error('❌ SMTP authentication failed.');
    console.error('Reason:');
    if (err.code === 'EAUTH') {
      if (pass && pass.length === 16) {
        console.error('Invalid App Password.');
      } else {
        console.error('Application-specific password required. (Primary password used instead of a 16-character Gmail App Password)');
      }
    } else if (!user || !pass) {
      console.error('Environment variables not loaded.');
    } else {
      console.error(err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});