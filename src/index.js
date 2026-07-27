require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const redirectRoute = require('./routes/redirect');
const telegramRoutes = require('./routes/telegram');
const { startSchedulers } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Trust proxy (Railway / Render pakai proxy) ───────────────────────────────
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: Origin ${origin} tidak diizinkan`));
  },
  credentials: true,
}));

// ─── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: 'Terlalu banyak request, coba lagi nanti' },
  standardHeaders: true,
  legacyHeaders: false,
});

const redirectLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 30,
  message: 'Terlalu banyak request',
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/domains', apiLimiter, domainRoutes);
app.use('/api/telegram', telegramRoutes);

// Health check endpoint untuk Railway
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// Redirect utama — harus di akhir
app.use('/', redirectLimiter, redirectRoute);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const { dbReadyPromise } = require('./models/database');

// ─── Start server ─────────────────────────────────────────────────────────────
dbReadyPromise.then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Nawala Redirect Backend running on port ${PORT}`);
    console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
    startSchedulers();
  });
});

module.exports = app;
