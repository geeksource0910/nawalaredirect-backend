const axios = require('axios');
const Domain = require('../models/domain');
const { checkDomainTrustPositif } = require('./trustpositif');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const INDIWTF_BASE_URL = 'https://indiwtf.com/api';
const BOT_USERNAME = 'InfoNawalaNewBot'; // Username bot tanpa @

/**
 * Kirim reply ke chat/group
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
 */
async function handleCekCommand(args, chatId, messageId) {
  if (!args || args.length === 0) {
    await sendReply(
      chatId,
      `❌ Format salah bray.\n\nContoh:\n<code>/cek https://domain-xxx.com</code>`,
      messageId
    );
    return;
  }

  let url = args[0].trim();

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    new URL(url);
  } catch {
    await sendReply(
      chatId,
      `❌ Format URL ga valid bray.\n\nContoh:\n<code>/cek https://domain-xxx.com</code>`,
      messageId
    );
    return;
  }

  const cleanDomain = url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];

  await sendReply(chatId, `🔍 Sedang cek <b>${cleanDomain}</b>...`, messageId);

  const isTrustPositifBlocked = await checkDomainTrustPositif(url);
  const indiwtfResult = await checkDomainIndiwtfDirect(url);

  let message = `🔍 <b>Hasil Cek Domain</b>\n`;
  message += `${'─'.repeat(25)}\n`;
  message += `🌐 <b>${cleanDomain}</b>\n\n`;

  message += `<b>TrustPositif:</b> ${isTrustPositifBlocked ? '🚫 NAWALA' : '✅ AMAN'}\n`;

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
  message += `<i>💡 Tag @${BOT_USERNAME} kalo mau ngobrol, bray!</i>\n`;
  message += `<i>Contoh: /cek https://google.com</i>`;

  await sendReply(chatId, message, messageId);
}

/**
 * Casual chat handler - respond ke mention aja
 * Gen Z style, panggilan "bray"
 */
async function handleCasualChat(text, chatId, messageId) {
  const lower = text.toLowerCase();

  // Sapaan
  if (/\b(halo|hai|hi|hello|hey|yo|pagi|siang|sore|malem|malam)\b/.test(lower)) {
    const responses = [
      `YOO bray! 🔥 Ada domain yang mau di-cek? Ketik <code>/cek &lt;url&gt;</code> sat set!`,
      `Halooo bray! ✨ Siap tempur nih. Butuh cek nawala? Gasss <code>/cek &lt;url&gt;</code>`,
      `Wassup bray! 🙌 Nawala checker on duty 24/7. Ketik <code>/help</code> buat lihat menu`,
      `Hai bray! 👋 Gass langsung aja, mau cek apaan hari ini?`,
    ];
    await sendReply(chatId, responses[Math.floor(Math.random() * responses.length)], messageId);
    return true;
  }

  // Terima kasih
  if (/\b(makasih|thanks|thank you|thx|tengs|nuhun|matur|mksh|tq|ty)\b/.test(lower)) {
    const responses = [
      `Sama-sama bray! 🤝 Anytime kalo butuh cek nawala 🔍`,
      `Nooo problem bray! ✨ Aku standby terus kok, tinggal panggil aja`,
      `Ez gg bray! 👍 Cek lagi kapan aja ya`,
      `You're welcome bray! 🙌 Skuy cek domain lain kalo mau`,
    ];
    await sendReply(chatId, responses[Math.floor(Math.random() * responses.length)], messageId);
    return true;
  }

  // Status/alive check
  if (/\b(alive|online|hidup|jalan|nyala|on|ping|bangun)\b/.test(lower)) {
    const responses = [
      `Alive & kicking bray! 🔥 24/7 no sleep mode`,
      `On duty bray! ⚡ Ready cek nawala kapan aja`,
      `Standby terus bray, mesin ga pernah tidur 🤖✨`,
      `Presentt bray! 💪 Servernya ngebut, tinggal <code>/cek</code> aja`,
    ];
    await sendReply(chatId, responses[Math.floor(Math.random() * responses.length)], messageId);
    return true;
  }

  // Pujian
  if (/\b(keren|mantap|mantul|gg|good|nice|top|epic|based|fire|goat|w bot)\b/.test(lower)) {
    const responses = [
      `Sheeesh bray 🔥 Makasih ya, aku juga excited kerja buat kalian!`,
      `Aaakh bray bikin blushing wkwk 🤖💫 Gass cek domain lagi!`,
      `W response detected 🏆 Makasih bray, kita bakal jaga terus!`,
      `Naisss bray 👑 Sekali klik, langsung cek. Skuy pake terus!`,
    ];
    await sendReply(chatId, responses[Math.floor(Math.random() * responses.length)], messageId);
    return true;
  }

  // Nanya bot/AI
  if (/\b(kamu siapa|lu siapa|kamu bot|lu bot|bot apa|siapa kamu|siapa lu|what are you|who are you)\b/.test(lower)) {
    await sendReply(
      chatId,
      `Aku <b>Redirect_Nawala</b> bray 🤖\n\n` +
      `Bot khusus buat cek domain kena nawala apa engga, plus jaga sistem redirect kalian tetep jalan smooth.\n\n` +
      `Kalo mau cek: <code>/cek &lt;url&gt;</code>\n` +
      `Kalo mau lihat menu: <code>/help</code>`,
      messageId
    );
    return true;
  }

  // Nanya fitur / bisa apa
  if (/\b(bisa apa|fitur|kegunaan|fungsi|kerjaan|bantuin|bantu apa|what can you do|can you)\b/.test(lower)) {
    await sendReply(
      chatId,
      `Bisa lumayan bray 💪\n\n` +
      `🔍 <b>Cek domain</b> — mau tau kena nawala atau engga? <code>/cek &lt;url&gt;</code>\n` +
      `📊 <b>Statistik sistem</b> — <code>/status</code>\n` +
      `🔔 <b>Auto notif</b> — tiap 4 jam kirim laporan ke group\n` +
      `⚡ <b>Auto rotate</b> — kalo priority domain kena nawala, langsung ganti otomatis\n\n` +
      `Ketik <code>/help</code> buat detail lengkap`,
      messageId
    );
    return true;
  }

  // Keyword nawala/domain/cek tapi bukan command
  if (/\b(cek nawala|cek domain|nawala|blokir|kena blokir)\b/.test(lower)) {
    await sendReply(
      chatId,
      `Mau cek domain bray? Gass ketik:\n\n<code>/cek https://domain-lo.com</code>\n\nGanti aja URL-nya, aku langsung cek TrustPositif + Indiwtf 🔍`,
      messageId
    );
    return true;
  }

  // Default fallback - kalo di-mention tapi ga match keyword
  const fallbacks = [
    `Yo bray! 👋 Mau di-bantu apa? Ketik <code>/help</code> buat lihat menu ku`,
    `Halo bray 🙌 Kalo mau cek domain, ketik <code>/cek &lt;url&gt;</code>. Kalo lupa command, ketik <code>/help</code>`,
    `Aku denger bray 👂 Ada yang mau di-cek? Skuy <code>/cek &lt;url&gt;</code>`,
    `Present bray! ⚡ Butuh cek nawala? Panggil aja <code>/cek</code>, aku sat set`,
  ];
  await sendReply(chatId, fallbacks[Math.floor(Math.random() * fallbacks.length)], messageId);
  return true;
}

/**
 * Cek apakah pesan mention bot
 * (via @username atau reply ke pesan bot)
 */
function isMentioningBot(message) {
  const text = message.text || '';

  // Cek mention @BotUsername
  if (text.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) {
    return true;
  }

  // Cek reply ke pesan bot
  if (message.reply_to_message?.from?.username?.toLowerCase() === BOT_USERNAME.toLowerCase()) {
    return true;
  }

  // Cek text_mention entity (mention tanpa @, kayak "Redirect_Nawala")
  if (message.entities) {
    for (const entity of message.entities) {
      if (entity.type === 'mention' || entity.type === 'text_mention') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Main handler
 */
async function handleTelegramUpdate(update) {
  try {
    const message = update.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const text = message.text.trim();

    // Batasi cuma di group yang di-whitelist
    if (CHAT_ID && chatId.toString() !== CHAT_ID.toString()) {
      console.log(`⚠️  Command dari chat ${chatId} diabaikan (bukan group whitelist)`);
      return;
    }

    // Cek command dulu (prefix /)
    const commandMatch = text.match(/^\/(\w+)(@\w+)?\s*(.*)/);

    if (commandMatch) {
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
          console.log(`ℹ️  Command tidak dikenal: /${command}`);
          break;
      }
      return;
    }

    // Bukan command - cek apakah mention bot
    if (isMentioningBot(message)) {
      console.log(`💬 [TELEGRAM CHAT] Mention detected from chat ${chatId}: "${text.slice(0, 50)}"`);

      // Hapus mention @username dari text buat parsing lebih clean
      const cleanText = text.replace(new RegExp(`@${BOT_USERNAME}`, 'gi'), '').trim();

      await handleCasualChat(cleanText, chatId, messageId);
      return;
    }

    // Bukan command & bukan mention → diem (biar ga spam)
  } catch (err) {
    console.error('❌ Error handleTelegramUpdate:', err.message);
  }
}

module.exports = { handleTelegramUpdate };
