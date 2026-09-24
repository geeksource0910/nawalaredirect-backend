const express = require('express');
const Domain = require('../models/domain');
const { checkDomain, checkAllDomains } = require('../services/healthCheck');
const { authMiddleware } = require('../middleware/auth');
const { checkDomainFull, checkAllDomainsIndiwtf } = require('../services/indiwtf');
const db = require('../models/database');

const router = express.Router();

// GET /api/domains
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { group } = req.query;
    const data = group ? await Domain.getByGroup(group) : await Domain.getAll();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await Domain.getStats();
    const groupStats = await Domain.getStatsByGroup();
    res.json({ success: true, stats, groupStats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/groups
router.get('/groups', authMiddleware, async (req, res) => {
  try {
    const groups = await Domain.getAllGroups();
    res.json({ success: true, groups: groups.map(g => g.group_name) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/active
// FIX: tambah authMiddleware — sebelumnya publik tanpa auth
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const { group } = req.query;
    const data = group ? await Domain.getActiveByGroup(group) : await Domain.getActive();
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/domains/stats/detailed
router.get('/stats/detailed', authMiddleware, async (req, res) => {
  try {
    const redirectPerGroup = await db.all(`
      SELECT d.group_name, COUNT(r.id) as count
      FROM redirect_logs r
      JOIN domains d ON r.redirected_to = d.url
      GROUP BY d.group_name
      ORDER BY count DESC
    `);
    const redirectPerDay = await db.all(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM redirect_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    const topDomains = await db.all(`
      SELECT redirected_to, COUNT(*) as count
      FROM redirect_logs
      GROUP BY redirected_to
      ORDER BY count DESC
      LIMIT 5
    `);
    const redirectGroupPerDay = await db.all(`
      SELECT DATE(r.created_at) as date, d.group_name, COUNT(*) as count
      FROM redirect_logs r
      JOIN domains d ON r.redirected_to = d.url
      WHERE r.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(r.created_at), d.group_name
      ORDER BY date ASC
    `);
    res.json({ success: true, redirectPerGroup, redirectPerDay, topDomains, redirectGroupPerDay });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { url, label, group_name } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL wajib diisi' });
    const result = await Domain.add(url, label || '', group_name || '');
    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, id: result.id });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/domains/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Domain.update(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/domains/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Domain.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/:id/check
router.post('/:id/check', authMiddleware, async (req, res) => {
  try {
    const domain = await Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    const result = await checkDomain(domain);
    res.json({ success: true, result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/check-all
router.post('/check-all', authMiddleware, async (req, res) => {
  try {
    await checkAllDomains();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/:id/check-isp
router.post('/:id/check-isp', authMiddleware, async (req, res) => {
  try {
    const domain = await Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    const result = await checkDomainFull(domain);
    res.json({ success: true, status: result.status, isBlocked: result.isBlocked, source: result.source });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/check-all-isp
router.post('/check-all-isp', authMiddleware, async (req, res) => {
  try {
    const results = await checkAllDomainsIndiwtf();
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/domains/:id/group
router.put('/:id/group', authMiddleware, async (req, res) => {
  try {
    const { group_name } = req.body;
    await Domain.update(req.params.id, { group_name: group_name || '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/domains/:id/set-priority
router.post('/:id/set-priority', authMiddleware, async (req, res) => {
  try {
    const domain = await Domain.getById(req.params.id);
    if (!domain) return res.status(404).json({ success: false, error: 'Domain tidak ditemukan' });
    await Domain.setPriority(domain.id, domain.group_name);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
