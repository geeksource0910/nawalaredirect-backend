const db = require('./database');

const Domain = {
  getAll() {
    return db.all('SELECT * FROM domains ORDER BY group_name ASC, is_priority DESC, created_at DESC');
  },
  getByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE group_name=? ORDER BY is_priority DESC, created_at DESC', [groupName]);
  },
  getActiveByGroup(groupName) {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 AND group_name=? ORDER BY is_priority DESC, fail_count ASC', [groupName]);
  },
  getAllGroups() {
    return db.all("SELECT DISTINCT group_name FROM domains WHERE group_name IS NOT NULL AND group_name != '' ORDER BY group_name ASC");
  },
  getActive() {
    return db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY is_priority DESC, fail_count ASC');
  },
  getPriorityByGroup(groupName) {
    return db.get('SELECT * FROM domains WHERE group_name=? AND is_priority=1 AND is_active=1 AND is_blocked=0', [groupName]);
  },

  // FIX: async + await kedua query — sebelumnya fire-and-forget, priority tidak pernah ke-set dengan benar
  async setPriority(id, groupName) {
    await db.run('UPDATE domains SET is_priority=0 WHERE group_name=?', [groupName]);
    await db.run('UPDATE domains SET is_priority=1, updated_at=NOW() WHERE id=?', [parseInt(id)]);
  },

  getTargetByGroup(groupName) {
    return Promise.resolve().then(async () => {
      const priority = await this.getPriorityByGroup(groupName);
      if (priority) return priority;

      const candidates = await db.all(
        'SELECT * FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0 ORDER BY fail_count ASC',
        [groupName]
      );
      if (!candidates.length) return null;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      await this.setPriority(chosen.id, groupName);
      console.log(`🔄 [PRIORITY] Group "${groupName}" → prioritas baru: ${chosen.url}`);
      return chosen;
    });
  },
  getTarget() {
    return Promise.resolve().then(async () => {
      const priority = await db.get('SELECT * FROM domains WHERE is_priority=1 AND is_active=1 AND is_blocked=0 LIMIT 1');
      if (priority) return priority;

      const candidates = await db.all('SELECT * FROM domains WHERE is_active=1 AND is_blocked=0 ORDER BY fail_count ASC');
      if (!candidates.length) return null;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      await db.run('UPDATE domains SET is_priority=0');
      await db.run('UPDATE domains SET is_priority=1, updated_at=NOW() WHERE id=?', [chosen.id]);
      return chosen;
    });
  },
  add(url, label = '', groupName = '') {
    return Promise.resolve().then(async () => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
      try {
        const existing = groupName
          ? await db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=?', [groupName])
          : await db.get('SELECT COUNT(*) as c FROM domains');
        const isPriority = (parseInt(existing?.c) || 0) === 0 ? 1 : 0;

        const r = await db.run(
          'INSERT INTO domains (url, label, group_name, is_priority) VALUES (?, ?, ?, ?) RETURNING id',
          [url, label, groupName, isPriority]
        );
        return { success: true, id: r.lastInsertRowid };
      } catch (e) {
        if (e.message?.includes('unique') || e.message?.includes('duplicate')) return { success: false, error: 'Domain sudah ada' };
        throw e;
      }
    });
  },
  update(id, data) {
    return Promise.resolve().then(async () => {
      const fields = [], values = [];
      if (data.url !== undefined) { fields.push('url=?'); values.push(data.url); }
      if (data.label !== undefined) { fields.push('label=?'); values.push(data.label); }
      if (data.group_name !== undefined) { fields.push('group_name=?'); values.push(data.group_name); }
      if (data.is_active !== undefined) { fields.push('is_active=?'); values.push(data.is_active ? 1 : 0); }
      if (data.is_blocked !== undefined) { fields.push('is_blocked=?'); values.push(data.is_blocked ? 1 : 0); }
      if (data.is_priority !== undefined) { fields.push('is_priority=?'); values.push(data.is_priority ? 1 : 0); }
      if (!fields.length) return { success: false, error: 'Tidak ada yang diupdate' };
      fields.push('updated_at=NOW()');
      values.push(parseInt(id));
      await db.run(`UPDATE domains SET ${fields.join(',')} WHERE id=?`, values);
      return { success: true };
    });
  },
  delete(id) {
    return db.run('DELETE FROM domains WHERE id=?', [parseInt(id)]).then(() => ({ success: true }));
  },
  updateHealthCheck(id, { isBlocked, statusCode, responseTime, error, forceBlocked = false }) {
    return Promise.resolve().then(async () => {
      const current = await db.get('SELECT fail_count, group_name, is_priority FROM domains WHERE id=?', [id]);
      if (!current) return;
      const maxFail = parseInt(await db.getSetting('max_fail_count') || '3');
      const failCount = isBlocked ? (current.fail_count + 1) : 0;
      const blocked = (forceBlocked || failCount >= maxFail) ? (isBlocked ? 1 : 0) : 0;

      await db.run(
        'UPDATE domains SET is_blocked=?, last_checked=NOW(), last_status_code=?, response_time=?, fail_count=?, updated_at=NOW() WHERE id=?',
        [blocked, statusCode, responseTime, failCount, id]
      );
      await db.run(
        'INSERT INTO health_check_logs(domain_id,status,status_code,response_time,error_message) VALUES(?,?,?,?,?)',
        [id, isBlocked ? 'blocked' : 'ok', statusCode, responseTime, error || null]
      );

      if (blocked === 1 && current.is_priority === 1 && current.group_name) {
        console.log(`⚠️  [PRIORITY] Prioritas group "${current.group_name}" kena nawala, auto-rotate...`);
        await db.run('UPDATE domains SET is_priority=0 WHERE id=?', [id]);
        const candidates = await db.all(
          'SELECT * FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0 AND id!=? ORDER BY fail_count ASC',
          [current.group_name, id]
        );
        if (candidates.length) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          await db.run('UPDATE domains SET is_priority=1, updated_at=NOW() WHERE id=?', [chosen.id]);
          console.log(`✅ [PRIORITY] Auto-rotate ke: ${chosen.url}`);
        }
      }
    });
  },
  getStats() {
    return Promise.resolve().then(async () => ({
      total: (await db.get('SELECT COUNT(*) as c FROM domains')).c,
      active: (await db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=1 AND is_blocked=0')).c,
      blocked: (await db.get('SELECT COUNT(*) as c FROM domains WHERE is_blocked=1')).c,
      inactive: (await db.get('SELECT COUNT(*) as c FROM domains WHERE is_active=0')).c,
      totalRedirects: (await db.get('SELECT COUNT(*) as c FROM redirect_logs')).c,
      todayRedirects: (await db.get("SELECT COUNT(*) as c FROM redirect_logs WHERE DATE(created_at)=CURRENT_DATE")).c,
    }));
  },
  getStatsByGroup() {
    return Promise.resolve().then(async () => {
      const groups = await this.getAllGroups();
      return Promise.all(groups.map(async g => ({
        group: g.group_name,
        total: (await db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=?', [g.group_name])).c,
        active: (await db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=? AND is_active=1 AND is_blocked=0', [g.group_name])).c,
        blocked: (await db.get('SELECT COUNT(*) as c FROM domains WHERE group_name=? AND is_blocked=1', [g.group_name])).c,
      })));
    });
  },
  logRedirect(url, userAgent, ip) {
    return db.run('INSERT INTO redirect_logs(redirected_to,user_agent,ip_address) VALUES(?,?,?)', [url, userAgent, ip]);
  },
  getById(id) {
    return db.get('SELECT * FROM domains WHERE id=?', [parseInt(id)]);
  },
  getRandomActive() { return this.getTarget(); },
  getRandomActiveByGroup(g) { return this.getTargetByGroup(g); },
};

module.exports = Domain;
