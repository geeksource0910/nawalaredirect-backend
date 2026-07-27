const axios = require('axios');
const Domain = require('../models/domain');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('⚠️  Telegram tidak dikonfigurasi, skip notifikasi');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
    console.log('📤 Telegram report terkirim');
  } catch (err) {
    console.error('❌ Gagal kirim Telegram:', err.message);
  }
}

async function sendDomainReport() {
  const stats = await Domain.getStats();
  const domains = await Domain.getAll();

  const activeDomains = domains.filter(d => d.is_active === 1 && d.is_blocked === 0);
  const blockedDomains = domains.filter(d => d.is_blocked === 1);

  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  let message = `🔔 <b>LAPORAN DOMAIN NAWALA</b>\n`;
  message += `📅 ${now} WIB\n`;
  message += `${'─'.repeat(30)}\n\n`;

  message += `📊 <b>STATISTIK</b>\n`;
  message += `✅ Aktif: <b>${stats.active}</b> domain\n`;
  message += `🚫 Diblokir: <b>${stats.blocked}</b> domain\n`;
  message += `⏸️ Nonaktif: <b>${stats.inactive}</b> domain\n`;
  message += `🔄 Total redirect hari ini: <b>${stats.todayRedirects}</b>\n\n`;

  if (activeDomains.length > 0) {
    message += `✅ <b>DOMAIN AKTIF (${activeDomains.length})</b>\n`;
    activeDomains.forEach((d, i) => {
      const label = d.label ? ` [${d.label}]` : '';
      const rt = d.response_time ? ` ${d.response_time}ms` : '';
      const priority = d.is_priority === 1 ? ' ⭐' : '';
      message += `${i + 1}. ${d.url}${label}${rt}${priority}\n`;
    });
    message += '\n';
  }

  if (blockedDomains.length > 0) {
    message += `🚫 <b>DOMAIN DIBLOKIR NAWALA (${blockedDomains.length})</b>\n`;
    blockedDomains.forEach((d, i) => {
      const label = d.label ? ` [${d.label}]` : '';
      const lastCheck = d.last_checked
        ? new Date(d.last_checked).toLocaleTimeString('id-ID')
        : '-';
      message += `${i + 1}. ${d.url}${label} (cek: ${lastCheck})\n`;
    });
    message += '\n';
  }

  if (activeDomains.length === 0) {
    message += `⚠️ <b>PERHATIAN: Semua domain tidak aktif!</b>\n`;
    message += `Segera tambahkan domain baru di dashboard.\n`;
  }

  message += `${'─'.repeat(30)}\n`;
  message += `🤖 Auto report setiap 4 jam`;

  await sendMessage(message);
}

async function notifyDomainBlocked(domain) {
  const label = domain.label ? ` [${domain.label}]` : '';
  const group = domain.group_name || '';

  // Cari prioritas baru setelah domain ini diblokir
  let newPriority = null;
  if (group) {
    newPriority = await Domain.getPriorityByGroup(group);
    if (newPriority && newPriority.id === domain.id) newPriority = null;
  }

  let message = `⚠️ <b>ATTENTION</b>\n\n`
    + `Domain Nawala <b>${domain.url}</b>${label} sudah dihapus dari rotasi redirect otomatis\n`;

  if (newPriority) {
    const newLabel = newPriority.label ? ` [${newPriority.label}]` : '';
    message += `🔄 Prioritas baru: <b>${newPriority.url}</b>${newLabel}`;
  } else {
    message += `⚠️ Tidak ada domain cadangan aktif!`;
  }

  await sendMessage(message);
}

async function notifyAllDomainsDown() {
  const message = `🆘 <b>DARURAT: SEMUA DOMAIN TIDAK AKTIF!</b>\n\n`
    + `Tidak ada domain yang bisa digunakan untuk redirect.\n`
    + `Segera tambahkan domain baru melalui dashboard!\n\n`
    + `⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;

  await sendMessage(message);
}

module.exports = {
  sendMessage,
  sendDomainReport,
  notifyDomainBlocked,
  notifyAllDomainsDown,
};
