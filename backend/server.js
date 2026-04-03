const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');

const productRoutes = require('./routes/productRoutes');
const stockRoutes = require('./routes/stockRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRoutes');
const { authMiddleware } = require('./middleware/authMiddleware');
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Public routes
app.use('/auth', authRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected Routes
app.use('/users', authMiddleware, userRoutes);
app.use('/products', authMiddleware, productRoutes);
app.use('/stock', authMiddleware, stockRoutes);
app.use('/transactions', authMiddleware, transactionRoutes);

const PORT = process.env.PORT || 5000;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});