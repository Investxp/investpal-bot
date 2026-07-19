require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const prescriptionRoutes = require('./routes/prescriptions');
const cartRoutes = require('./routes/cart');
const adminRoutes = require('./routes/admin');
const deliveryRoutes = require('./routes/delivery');

const app = express();

// ── Security & Middleware ───────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

// ── Static Files ────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pharmacy: process.env.PHARMACY_NAME,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/products',      productRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/cart',          cartRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/delivery',      deliveryRoutes);

// ── Serve Frontend ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Global Error Handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n💊 QEMRX PHARMACY backend running`);
  console.log(`   Port    : ${PORT}`);
  console.log(`   Env     : ${process.env.NODE_ENV}`);
  console.log(`   M-Pesa  : ${process.env.MPESA_ENV || 'not configured'}`);
  console.log(`   Base URL: ${process.env.BASE_URL}\n`);
});

module.exports = app;
