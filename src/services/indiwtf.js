const axios = require('axios');
const Domain = require('../models/domain');
const { notifyDomainBlocked, notifyAllDomainsDown } = require('./telegram');
const { checkDomainTrustPositif, checkDomainsBatch } = require('./trustpositif');
const { checkIPOS } = require('./ipos');

const INDIWTF_TOKEN = process.env.INDIWTF_TOKEN;
const BASE_URL = 'https://indiwtf.com/api';

/**
 * Cek 1 domain via Indiwtf (dipake buat cross-verify manual)
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
 * Cek 1 domain - IPOS primary (real-time), TrustPositif fallback
 * Return: { isBlocked, source, tpBlocked, iposBlocked }
 */
async function checkDomainDual(url) {
  // Cek IPOS dulu (real-time DNS)
  const iposResult = await checkIPOS(url);

  // Cek TrustPositif (blocklist database) sebagai secondary
  const tpBlocked = await checkDomainTrustPositif(url);

  // Kalo salah satu detect blocked = blocked
  const isBlocked = iposResult.blocked || tpBlocked;

  let source;
  if (iposResult.blocked && tpBlocked) source = 'ipos+trustpositif';
  else if (iposResult.blocked) source = 'ipos';
  else if (tpBlocked) source = 'trustpositif';
  else source = 'none';

  return {
    isBlocked,
    source,
    iposBlocked: iposResult.blocked,
    tpBlocked,
    iposError: iposResult.error,
  };
}

/**
 * Manual check dari dashboard (klik refresh) — dual source check
 */
async function checkDomainFull(domain) {
  console.log(`🔍 [CHECK] ${domain.url}`);
  const result = await checkDomainDual(domain.url);
  const wasBlocked = domain.is_blocked === 1;

  await Domain.updateHealthCheck(domain.id, {
    isBlocked: result.isBlocked,
    statusCode: result.isBlocked ? 403 : 200,
    responseTime: null,
    error: null,
    forceBlocked: true,
  });

  if (result.isBlocked && !wasBlocked) {
    console.log(`🚫 [${result.source.toUpperCase()}] ${domain.url} NAWALA!`);
    await notifyDomainBlocked(domain);
  } else if (!result.isBlocked) {
    console.log(`✅ [CHECK] ${domain.url} aman (ipos:${result.iposBlocked ? 'X' : 'OK'} tp:${result.tpBlocked ? 'X' : 'OK'})`);
  }

  return {
    source: result.source,
    status: result.isBlocked ? 'blocked' : 'allowed',
    isBlocked: result.isBlocked,
    ipos: result.iposBlocked,
    trustpositif: result.tpBlocked,
  };
}

/**
 * Health check semua domain — cron job tiap X menit
 * IPOS primary (real-time per-domain), TrustPositif fallback batch
 */
async function checkAllDomainsIndiwtf() {
  const allDomains = await Domain.getAll();
  const domains = allDomains.filter(d => d.is_active === 1);
  if (!domains.length) return [];

  console.log(`🔍 [HEALTH CHECK] ${domains.length} domains via IPOS + TrustPositif...`);

  // Batch check TrustPositif dulu (1 API call untuk semua)
  const tpResults = await checkDomainsBatch(domains.map(d => d.url));

  // Parallel check IPOS untuk semua domain (fast DNS query)
  const iposResults = await Promise.all(
    domains.map(d => checkIPOS(d.url).then(r => ({ id: d.id, ...r })))
  );
  const iposMap = new Map(iposResults.map(r => [r.id, r]));

  const results = [];

  for (const domain of domains) {
    const clean = domain.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0]
      .toLowerCase();

    const tpBlocked = tpResults.get(clean) === true;
    const iposData = iposMap.get(domain.id);
    const iposBlocked = iposData?.blocked === true;

    // Blocked = salah satu source detect blocked
    const isBlocked = iposBlocked || tpBlocked;
    const wasBlocked = domain.is_blocked === 1;

    let source = 'none';
    if (iposBlocked && tpBlocked) source = 'ipos+tp';
    else if (iposBlocked) source = 'ipos';
    else if (tpBlocked) source = 'trustpositif';

    // SELALU update last_checked
    await Domain.updateHealthCheck(domain.id, {
      isBlocked,
      statusCode: isBlocked ? 403 : 200,
      responseTime: null,
      error: null,
      forceBlocked: true,
    });

    if (isBlocked) {
      console.log(`🚫 [${source.toUpperCase()}] ${domain.url} nawala!`);
      if (!wasBlocked) await notifyDomainBlocked(domain);
    }

    results.push({ ...domain, isBlocked, source, iposBlocked, tpBlocked });
  }

  // Cek apakah semua domain aktif udah down
  const activeList = await Domain.getActive();
  if (activeList.length === 0 && domains.length > 0) {
    await notifyAllDomainsDown();
  }

  const blocked = results.filter(r => r.isBlocked).length;
  const iposCount = results.filter(r => r.iposBlocked).length;
  const tpCount = results.filter(r => r.tpBlocked).length;
  console.log(`✅ [HEALTH CHECK] Selesai: ${results.length - blocked} OK | ${blocked} Blocked (ipos:${iposCount} tp:${tpCount})`);

  return results;
}

module.exports = {
  checkDomainIndiwtf,
  checkDomainFull,
  checkAllDomainsIndiwtf,
  checkDomainDual,
};
