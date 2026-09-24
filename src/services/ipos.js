const axios = require('axios');

// Endpoint Trust Positif Kominfo real-time checker (bukan blocklist DB)
// Same source yang dipake project google sheet system (server.js)
const CHECK_URL = 'https://trustpositif.komdigi.go.id/Rule/CheckSTS';

const AXIOS_CONFIG = {
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
  },
  // ga throw error di status 4xx/5xx
  validateStatus: () => true,
};

/**
 * Cek 1 domain via Trust Positif real-time endpoint
 * Return: { blocked: boolean, reason: string, error: string|null }
 */
async function checkIPOS(url) {
  const domain = url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .toLowerCase();

  try {
    const res = await axios.get(CHECK_URL, {
      ...AXIOS_CONFIG,
      params: { domain },
    });

    const body = String(res.data || '').toLowerCase();

    // Detect blocked keywords dari response body
    // Trust Positif biasa balikin: "diblokir", "blocked", "trust+", "tidak diizinkan", dll.
    const blockedKeywords = [
      'diblokir',
      'blocked',
      'trust+',
      'trustpositif',
      'not allowed',
      'tidak diizinkan',
      'tidak diperbolehkan',
      'internet positif',
    ];

    const safeKeywords = [
      'aman',
      'safe',
      'not blocked',
      'tidak ditemukan',
      'not found in database',
      'clean',
    ];

    // Cek dulu kalo ada safe keyword (higher priority)
    const isSafe = safeKeywords.some(kw => body.includes(kw));
    if (isSafe) return { blocked: false, reason: 'safe-keyword', error: null };

    // Cek blocked keyword
    const isBlocked = blockedKeywords.some(kw => body.includes(kw));
    if (isBlocked) return { blocked: true, reason: 'blocked-keyword', error: null };

    // Kalo body pendek/kosong, mungkin domain aman (endpoint balikin empty)
    if (body.trim().length < 50) return { blocked: false, reason: 'empty-response', error: null };

    // Default: assume safe kalo ga match keyword apapun
    return { blocked: false, reason: 'no-match', error: null };
  } catch (err) {
    // Network error / timeout — return unknown (jangan false positive)
    return { blocked: false, reason: null, error: err.message };
  }
}

module.exports = { checkIPOS };
