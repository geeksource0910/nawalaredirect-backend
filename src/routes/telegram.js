const express = require('express');
const router = express.Router();
const { handleTelegramUpdate } = require('../services/telegramCommand');

/**
 * Webhook endpoint - dipanggil Telegram tiap ada pesan baru
 * URL: POST /api/telegram/webhook
 */
router.post('/webhook', async (req, res) => {
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
