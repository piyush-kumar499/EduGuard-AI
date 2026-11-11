'use strict';

const { all } = require('../db');
const { RAW } = require('../router');
const validate = require('../validate');

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function buildFilter(query) {
  const where = [];
  const args = [];
  if (query.userId) { where.push('a.user_id = ?'); args.push(validate.id(query.userId, 'User')); }
  if (query.action) { where.push('a.action = ?'); args.push(validate.str(query.action, 'Action', { max: 80 })); }
  if (query.entity) { where.push('a.entity = ?'); args.push(validate.str(query.entity, 'Entity', { max: 80 })); }
  if (query.entityId) { where.push('a.entity_id = ?'); args.push(validate.str(query.entityId, 'Entity id', { max: 120 })); }
  if (query.from) { where.push('a.at >= ?'); args.push(`${validate.date(query.from, 'From')}T00:00:00.000Z`); }
  if (query.to) { where.push('a.at <= ?'); args.push(`${validate.date(query.to, 'To')}T23:59:59.999Z`); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

async function listAudit(ctx) {
  const pagination = validate.pagination(ctx.query);
  const filter = buildFilter(ctx.query);
  const totalRow = await all(`SELECT COUNT(*) AS n FROM audit_log a ${filter.sql}`, filter.args);
  const rows = await all(
    `SELECT a.*, u.name AS user_name, u.role AS user_role
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ${filter.sql}
      ORDER BY a.at DESC LIMIT ? OFFSET ?`,
    [...filter.args, pagination.limit, pagination.offset]
  );
  const [users, actions] = await Promise.all([
    all('SELECT DISTINCT user_id, (SELECT name FROM users WHERE id = user_id) AS user_name FROM audit_log WHERE user_id IS NOT NULL'),
    all('SELECT DISTINCT action FROM audit_log ORDER BY action')
  ]);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      at: row.at,
      userId: row.user_id,
      userName: row.user_name || 'System',
      userRole: row.user_role,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
      reason: row.reason,
      ip: row.ip
    })),
    total: Number(totalRow[0]?.n || 0),
    nextCursor: pagination.nextCursor(rows.length, Number(totalRow[0]?.n || 0)),
    users: users.map((row) => ({ id: row.user_id, name: row.user_name || 'Unknown' })),
    actions: actions.map((row) => row.action)
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function exportAudit(ctx) {
  const filter = buildFilter(ctx.query);
  const rows = await all(
    `SELECT a.*, u.name AS user_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${filter.sql} ORDER BY a.at DESC LIMIT 5000`,
    filter.args
  );
  const header = ['at', 'user', 'action', 'entity', 'entity_id', 'reason', 'before', 'after', 'ip'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.at, row.user_name || '', row.action, row.entity, row.entity_id || '',
      row.reason || '', row.before_json || '', row.after_json || '', row.ip || ''
    ].map(csvCell).join(','));
  }
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  ctx.res.setHeader('Content-Disposition', 'attachment; filename="eduguard-audit.csv"');
  ctx.res.end(`\uFEFF${lines.join('\n')}`);
  return RAW;
}

module.exports = [
  { method: 'GET', path: 'audit', handler: listAudit, hod: true },
  { method: 'GET', path: 'audit.csv', handler: exportAudit, hod: true }
];
