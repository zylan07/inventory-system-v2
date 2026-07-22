const express = require('express');
const next = require('next');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: './frontend' });
const handle = app.getRequestHandler();

const { initDb } = require('./backend/db');

// Import all routes
const productRoutes = require('./backend/routes/productRoutes');
const stockRoutes = require('./backend/routes/stockRoutes');
const transactionRoutes = require('./backend/routes/transactionRoutes');
const authRoutes = require('./backend/routes/auth');
const userRoutes = require('./backend/routes/userRoutes');
const notificationRoutes = require('./backend/routes/notificationRoutes');
const profileRoutes = require('./backend/routes/profileRoutes');
const settingsRoutes = require('./backend/routes/settingsRoutes');
const clientRoutes = require('./backend/routes/clientRoutes');
const purchaseQueueRoutes = require('./backend/routes/purchaseQueueRoutes');
const warehouseRoutes = require('./backend/routes/warehouseRoutes');
const { authMiddleware } = require('./backend/middleware/authMiddleware');

app.prepare().then(() => {
  const server = express();
  
  server.use(cors({ origin: true, credentials: true }));
  server.use(express.json());
  
  // Serve static files from root uploads
  server.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  server.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

  // Prefix routes under /api in production
  server.use('/api/auth', authRoutes);
  server.use('/api/users', authMiddleware, userRoutes);
  server.use('/api/products', authMiddleware, productRoutes);
  server.use('/api/stock', authMiddleware, stockRoutes);
  server.use('/api/transactions', authMiddleware, transactionRoutes);
  server.use('/api/notifications', authMiddleware, notificationRoutes);
  server.use('/api/profile', authMiddleware, profileRoutes);
  server.use('/api/settings', authMiddleware, settingsRoutes);
  server.use('/api/clients', authMiddleware, clientRoutes);
  server.use('/api/purchase-queue', authMiddleware, purchaseQueueRoutes);
  server.use('/api/warehouses', authMiddleware, warehouseRoutes);
  server.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Fallback to Next.js routing
  server.use((req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  
  initDb().then(() => {
    server.listen(PORT, (err) => {
      if (err) throw err;
      console.log(`🚀 Unified production server ready on http://localhost:${PORT}`);
      
      // Verify SMTP connection in background
      const { getTransporter } = require('./backend/utils/mailer');
      try {
        const transporter = getTransporter();
        transporter.verify()
          .then(() => console.log('✅ SMTP connection verified successfully!'))
          .catch(err => console.error('❌ SMTP authentication failed:', err.message));
      } catch (err) {
        console.error('❌ SMTP configuration failed:', err.message);
      }
    });
  }).catch(err => {
    console.error('❌ Database initialization failed on startup:', err.message);
    process.exit(1);
  });
});
