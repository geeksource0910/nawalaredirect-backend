const axios = require('axios');
const Domain = require('../models/domain');

// Keyword yang biasa muncul di halaman blokir Nawala / Internet Positif
const BLOCK_KEYWORDS = [
  'nawala',
  'internet positif',
  'internetpositif',
  'diblokir',
  'situs ini diblokir',
  'access denied',
  'blocked',
  'url filtering',
  'kominfo',
  'trustpositif',
  'nusa.net.id',
  'nawala.org',
];

// Timeout default 10 detik
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '10000');

/**
 * Cek apakah response mengandung konten blokir Nawala
 */
function isNawalaPage(html = '', finalUrl = '') {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = finalUrl.toLowerCase();

  for (const keyword of BLOCK_KEYWORDS) {
    if (lowerHtml.includes(keyword) || lowerUrl.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Health check untuk satu domain
 */
async function checkDomain(domain) {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(domain.url, {
      timeout: TIMEOUT,
      maxRedirects: 5,
      validateStatus: () => true, // jangan throw untuk status apapun
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const responseTime = Date.now() - startTime;
    const finalUrl = response.request?.res?.responseUrl || domain.url;
    const html = typeof response.data === 'string' ? response.data : '';
    
    const blocked = isNawalaPage(html, finalUrl) || response.status === 403;

    // FIX: await updateHealthCheck supaya error bisa ketangkap dan tidak fire-and-forget
    await Domain.updateHealthCheck(domain.id, {
      isBlocked: blocked,
      statusCode: response.status,
      responseTime,
      error: null,
    });

    return {
      id: domain.id,
      url: domain.url,
      label: domain.label,
      status: blocked ? 'blocked' : 'ok',
      statusCode: response.status,
      responseTime,
    };

  } catch (err) {
    const responseTime = Date.now() - startTime;
    const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout');
    const errorMsg = isTimeout ? 'Timeout' : (err.message || 'Unknown error');

    // FIX: await updateHealthCheck
    await Domain.updateHealthCheck(domain.id, {
      isBlocked: true,
      statusCode: null,
      responseTime,
      error: errorMsg,
    });

    return {
      id: domain.id,
      url: domain.url,
      label: domain.label,
      status: 'error',
      statusCode: null,
      responseTime,
      error: errorMsg,
    };
  }
}

/**
 * Health check semua domain sekaligus (concurrent)
 */
async function checkAllDomains() {
  // FIX: Domain.getAll() adalah async — wajib await
  const allDomains = await Domain.getAll();
  const domains = allDomains.filter(d => d.is_active === 1);
  
  if (domains.length === 0) {
    console.log('⚠️  Tidak ada domain aktif untuk dicek');
    return [];
  }

  console.log(`🔍 Health check ${domains.length} domain...`);

  // Jalankan concurrent tapi batasi 5 sekaligus supaya tidak overload
  const results = [];
  const chunkSize = 5;
  
  for (let i = 0; i < domains.length; i += chunkSize) {
    const chunk = domains.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(checkDomain));
    results.push(...chunkResults);
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const blocked = results.filter(r => r.status === 'blocked').length;
  const error = results.filter(r => r.status === 'error').length;

  console.log(`✅ Health check selesai: ${ok} OK | ${blocked} Blocked | ${error} Error`);

  return results;
}

module.exports = { checkAllDomains, checkDomain };
