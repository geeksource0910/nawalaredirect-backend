const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');
const { checkDomainTrustPositif, checkDomainsBatch } = require('./trustpositif');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

/**
 * Cek 1 domain via Indiwtf (dipake buat cross-verify manual di /cek command)
 * Return: { available: bool, blocked: bool }
 */
async function checkDomainIndiwtf(domain) {
  if (!INDIWTF_TOKEN) return null;
  try {
    const cleanDomain = domain.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0];
    const res = await axios.get(`${BASE_URL}/check`, {
      params: { domain: cleanDomain, token: INDIWTF_TOKEN },
      timeout: 15000,
    });
    return { domain: cleanDomain, ...res.data };
  } catch (err) {
    console.error(`❌ Indiwtf error for ${domain.url}:`, err.message);
    return null;
  }
}

/**
 * Cek 1 domain (dipake untuk manual check dari dashboard - klik refresh 🔄)
 * TrustPositif ONLY - Indiwtf skip untuk konsistensi dengan scheduler
 */
async function checkDomainFull(domain) {
  console.log(`🔍 [CHECK] ${domain.url}`);
  const isBlocked = await checkDomainTrustPositif(domain.url);
  const wasBlocked = domain.is_blocked === 1;

  await Domain.updateHealthCheck(domain.id, {
    isBlocked,
    statusCode: isBlocked ? 403 : 200,
    responseTime: null,
    error: null,
    forceBlocked: true,
  });

  if (isBlocked && !wasBlocked) {
    console.log(`🚫 [TRUSTPOSITIF] ${domain.url} NAWALA!`);
    await notifyDomainBlocked(domain);
  } else if (!isBlocked) {
    console.log(`✅ [TRUSTPOSITIF] ${domain.url} aman`);
  }

  return {
    source: 'trustpositif',
    status: isBlocked ? 'blocked' : 'allowed',
    isBlocked,
  };
}

/**
 * Health check semua domain (dipake scheduler cron tiap X menit)
 * TrustPositif ONLY - simpel, cepet, reliable
 */
async function checkAllDomainsIndiwtf() {
  const allDomains = await Domain.getAll();
  const domains = allDomains.filter(d => d.is_active === 1);
  if (!domains.length) return [];

  console.log(`🔍 [HEALTH CHECK] ${domains.length} domains...`);

  // Batch check semua domain sekali API call
  const tpResults = await checkDomainsBatch(domains.map(d => d.url));
  const results = [];

  for (const domain of domains) {
    const clean = domain.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0]
      .toLowerCase();

    const isBlocked = tpResults.get(clean) === true;
    const wasBlocked = domain.is_blocked === 1;

    // SELALU update last_checked, apapun hasilnya
    await Domain.updateHealthCheck(domain.id, {
      isBlocked,
      statusCode: isBlocked ? 403 : 200,
      responseTime: null,
      error: null,
      forceBlocked: true,
    });

    if (isBlocked) {
      console.log(`🚫 [TRUSTPOSITIF] ${domain.url} nawala!`);
      if (!wasBlocked) await notifyDomainBlocked(domain);
    }

    results.push({ ...domain, isBlocked, source: 'trustpositif' });
  }

  // Cek apakah semua domain aktif udah down
  const activeList = await Domain.getActive();
  if (activeList.length === 0 && domains.length > 0) {
    await notifyAllDomainsDown();
  }

  const blocked = results.filter(r => r.isBlocked).length;
  console.log(`✅ [HEALTH CHECK] Selesai: ${results.length - blocked} OK | ${blocked} Blocked`);

  return results;
}

module.exports = { checkDomainIndiwtf, checkDomainFull, checkAllDomainsIndiwtf };
