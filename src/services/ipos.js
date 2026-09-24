const dns = require('dns').promises;

// IP addresses buat blocked domains oleh IPOS/Nawala Kominfo
// Same list yang dipake project google sheet system (server.js)
const NAWALA_BLOCK_IPS = [
  '36.86.63.185',
  '36.86.63.184',
  '36.86.63.186',
  '36.86.63.187',
  '36.86.63.188',
  '36.86.63.189',
  '36.86.63.190',
  '36.86.63.191',
  '36.86.63.183',
  '36.86.63.182',
  '10.10.10.10',
  '180.131.144.144',
  '180.131.145.145',
];

// Custom DNS resolver pake IPOS Nawala Kominfo
// biar query resolve kayak dari ISP Indonesia (dapet IP block kalo kena nawala)
const iposResolver = new dns.Resolver();
iposResolver.setServers(['180.131.144.144', '180.131.145.145']);

/**
 * Cek 1 domain via IPOS DNS resolver (real-time detection)
 * Return: { blocked: boolean, ips: string[], error: string|null }
 */
async function checkIPOS(url, timeoutMs = 5000) {
  const domain = url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .toLowerCase();

  try {
    // Race dengan timeout supaya ga stuck
    const addresses = await Promise.race([
      iposResolver.resolve4(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DNS timeout')), timeoutMs)
      ),
    ]);

    // Kalo IP address match dengan block list = domain kena blokir
    const blocked = addresses.some(ip => NAWALA_BLOCK_IPS.includes(ip));
    return { blocked, ips: addresses, error: null };
  } catch (err) {
    // ENOTFOUND / NXDOMAIN = domain ga bisa resolve, treat as blocked
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { blocked: true, ips: [], error: 'NXDOMAIN' };
    }
    // Timeout atau error lain — return unknown (jangan false positive)
    return { blocked: false, ips: [], error: err.message };
  }
}

module.exports = { checkIPOS };
