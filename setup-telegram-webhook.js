/**
 * Script buat register webhook URL ke Telegram API
 *
 * Cara pakai:
 *   1. Set BASE_URL sesuai domain backend kamu
 *   2. Jalanin: node setup-telegram-webhook.js
 *   3. Sekali doang cukup, kecuali URL webhook berubah
 *
 * Kalau mau hapus webhook:
 *   node setup-telegram-webhook.js delete
 */

require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Ganti sesuai domain backend production kamu
const BASE_URL = process.env.BACKEND_URL || 'https://akseslinkresmi.com';
const WEBHOOK_URL = `${BASE_URL}/api/telegram/webhook`;

async function setWebhook() {
  if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN belum di-set di .env');
    process.exit(1);
  }

  try {
    console.log(`🔧 Setting webhook ke: ${WEBHOOK_URL}`);

    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        url: WEBHOOK_URL,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      }
    );

    if (res.data.ok) {
      console.log('✅ Webhook berhasil di-set!');
      console.log('   Response:', res.data.description);

      // Cek info webhook
      const info = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
      );
      console.log('\n📊 Webhook Info:');
      console.log('   URL:', info.data.result.url);
      console.log('   Pending updates:', info.data.result.pending_update_count);
      console.log('   Last error:', info.data.result.last_error_message || '(none)');
    } else {
      console.error('❌ Gagal set webhook:', res.data);
    }
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

async function deleteWebhook() {
  if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN belum di-set di .env');
    process.exit(1);
  }

  try {
    console.log('🗑️  Deleting webhook...');
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`,
      { drop_pending_updates: true }
    );
    if (res.data.ok) {
      console.log('✅ Webhook berhasil dihapus');
    } else {
      console.error('❌ Gagal hapus webhook:', res.data);
    }
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

// Main
const action = process.argv[2];
if (action === 'delete') {
  deleteWebhook();
} else {
  setWebhook();
}
