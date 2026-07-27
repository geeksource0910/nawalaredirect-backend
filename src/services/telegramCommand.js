const axios = require('axios');
const Domain = require('../models/domain');
const { checkDomainTrustPositif } = require('./trustpositif');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const INDIWTF_BASE_URL = 'https://indiwtf.com/api';

/**
 * Kirim reply ke chat/group (reply ke pesan tertentu)
 */
async function sendReply(chatId, text, replyToMessageId = null) {
  if (!BOT_TOKEN) {
    console.log('⚠️  Telegram tidak dikonfigurasi');
    return;
  }
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);
  } catch (err) {
    console.error('❌ Gagal kirim reply Telegram:', err.message);
  }
}

/**
 * Cek 1 domain via Indiwtf (khusus untuk command /cek)
 */
async function checkDomainIndiwtfDirect(url) {
  if (!INDIWTF_TOKEN) return { available: false };
  try {
    const cleanDomain = url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
    const res = await axios.get(`${INDIWTF_BASE_URL}/check`, {
      params: { domain: cleanDomain, token: INDIWTF_TOKEN },
      timeout: 15000,
    });
    return { available: true, blocked: res.data?.status === 'blocked' };
  } catch (err) {
    console.error(`❌ Indiwtf error for ${url}: ${err.message}`);
    return { available: false, error: err.message };
  }
}

/**
 * Command: /cek <url>
 * Cek 1 domain via TrustPositif + Indiwtf
 */
async function handleCekCommand(args, chatId, messageId) {
  if (!args || args.length === 0) {
    await sendReply(
      chatId,
      `❌ Format salah brek.\n\nContoh:\n<code>/cek https://domain-xxx.com</code>`,
      messageId
    );
    return;
  }

  let url = args[0].trim();

  // Auto-tambah https:// kalau ga ada
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    await sendReply(
      chatId,
      `❌ Format URL ga valid brek.\n\nContoh:\n<code>/cek https://domain-xxx.com</code>`,
      messageId
    );
    return;
  }

  const cleanDomain = url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];

  // Kirim pesan "sedang cek..." dulu
  await sendReply(chatId, `🔍 Sedang cek <b>${cleanDomain}</b>...`, messageId);

  // Cek TrustPositif
  const isTrustPositifBlocked = await checkDomainTrustPositif(url);

  // Cek Indiwtf
  const indiwtfResult = await checkDomainIndiwtfDirect(url);

  // Build response
  let message = `🔍 <b>Hasil Cek Domain</b>\n`;
  message += `${'─'.repeat(25)}\n`;
  message += `🌐 <b>${cleanDomain}</b>\n\n`;

  // TrustPositif result
  message += `<b>TrustPositif:</b> ${isTrustPositifBlocked ? '🚫 NAWALA' : '✅ AMAN'}\n`;

  // Indiwtf result
  if (indiwtfResult.available) {
    message += `<b>Indiwtf:</b> ${indiwtfResult.blocked ? '🚫 NAWALA' : '✅ AMAN'}\n`;
  } else {
    message += `<b>Indiwtf:</b> ⚠️ Tidak tersedia\n`;
  }

  message += `\n<b>Status Final:</b> `;
  const finalBlocked = isTrustPositifBlocked || (indiwtfResult.available && indiwtfResult.blocked);
  message += finalBlocked ? '🚫 <b>NAWALA</b>' : '✅ <b>AMAN</b>';

  await sendReply(chatId, message, messageId);
}

/**
 * Command: /status
 * Statistik sistem
 */
async function handleStatusCommand(chatId, messageId) {
  try {
    const stats = await Domain.getStats();

    const now = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    let message = `📊 <b>STATISTIK NAWALA</b>\n`;
    message += `${'─'.repeat(25)}\n`;
    message += `📅 ${now} WIB\n\n`;
    message += `✅ Aktif: <b>${stats.active}</b> domain\n`;
    message += `🚫 Diblokir: <b>${stats.blocked}</b> domain\n`;
    message += `⏸️ Nonaktif: <b>${stats.inactive}</b> domain\n`;
    message += `🔄 Total redirect hari ini: <b>${stats.todayRedirects}</b>`;

    await sendReply(chatId, message, messageId);
  } catch (err) {
    console.error('❌ Error handleStatusCommand:', err.message);
    await sendReply(chatId, `❌ Gagal ambil statistik: ${err.message}`, messageId);
  }
}

/**
 * Command: /help
 * List semua command
 */
async function handleHelpCommand(chatId, messageId) {
  let message = `🤖 <b>COMMAND TERSEDIA</b>\n`;
  message += `${'─'.repeat(25)}\n\n`;
  message += `<code>/cek &lt;url&gt;</code>\n`;
  message += `Cek 1 domain via TrustPositif + Indiwtf\n\n`;
  message += `<code>/status</code>\n`;
  message += `Statistik sistem (jumlah domain)\n\n`;
  message += `<code>/help</code>\n`;
  message += `Bantuan command\n\n`;
  message += `<i>💡 Contoh: /cek https://google.com</i>`;

  await sendReply(chatId, message, messageId);
}

/**
 * Main handler - route command ke handler yang sesuai
 */
async function handleTelegramUpdate(update) {
  try {
    const message = update.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const text = message.text.trim();

    // Batasi cuma di group yang di-whitelist (env TELEGRAM_CHAT_ID)
    if (CHAT_ID && chatId.toString() !== CHAT_ID.toString()) {
      console.log(`⚠️  Command dari chat ${chatId} diabaikan (bukan group whitelist)`);
      return;
    }

    // Parse command
    // Format command Telegram bisa: /cek atau /cek@BotUsername
    const commandMatch = text.match(/^\/(\w+)(@\w+)?\s*(.*)/);
    if (!commandMatch) return;

    const command = commandMatch[1].toLowerCase();
    const argsString = commandMatch[3].trim();
    const args = argsString ? argsString.split(/\s+/) : [];

    console.log(`📥 [TELEGRAM CMD] /${command} from chat ${chatId}`);

    switch (command) {
      case 'cek':
      case 'check':
        await handleCekCommand(args, chatId, messageId);
        break;
      case 'status':
      case 'stats':
        await handleStatusCommand(chatId, messageId);
        break;
      case 'help':
      case 'start':
        await handleHelpCommand(chatId, messageId);
        break;
      default:
        // Command ga dikenal, silent (biar ga spam group kalau ada command bot lain)
        console.log(`ℹ️  Command tidak dikenal: /${command}`);
        break;
    }
  } catch (err) {
    console.error('❌ Error handleTelegramUpdate:', err.message);
  }
}

module.exports = { handleTelegramUpdate };
