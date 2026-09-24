const express = require('express');
const router = express.Router();
const { handleTelegramUpdate } = require('../services/telegramCommand');

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/**
 * Webhook endpoint - dipanggil Telegram tiap ada pesan baru
 * URL: POST /api/telegram/webhook
 */
router.post('/webhook', async (req, res) => {
  // FIX: Validasi secret token dari Telegram supaya endpoint tidak bisa dihit sembarang pihak
  if (WEBHOOK_SECRET) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    if (incoming !== WEBHOOK_SECRET) {
      console.warn(`⚠️  Webhook ditolak — secret tidak cocok (IP: ${req.ip})`);
      return res.status(403).json({ ok: false });
    }
  }

  // Respond 200 dulu ke Telegram biar dia ga retry
  res.status(200).json({ ok: true });

  // Process update secara async (ga block response)
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('❌ Webhook process error:', err.message);
  }
});

/**
 * Info endpoint - buat cek status webhook (opsional)
 */
router.get('/status', (req, res) => {
  res.json({
    ok: true,
    webhook: 'active',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
