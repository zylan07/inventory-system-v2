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

const PORT = process.env.PORT || 5000;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});