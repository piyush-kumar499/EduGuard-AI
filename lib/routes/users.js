'use strict';

const crypto = require('crypto');
const { all, get, run } = require('../db');
const { hashPassword } = require('../auth');
const { writeAudit } = require('../audit');
const { activeTerm } = require('../permissions');
const validate = require('../validate');
const { HttpError } = validate;

function tempPassword() {
  // Guaranteed letter + number, 14 characters, no ambiguous glyphs.
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < 14) chars.push(pick(letters + digits));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

async function listUsers(ctx) {
  const term = await activeTerm();
  const q = validate.str(ctx.query.q || '', 'Search', { min: 0, max: 120, required: false });
  const role = ctx.query.role ? validate.oneOf(ctx.query.role, ['HOD', 'FACULTY'], 'Role') : null;
  const includeInactive = validate.bool(ctx.query.includeInactive, true);

  let sql = `SELECT id, name, email, role, active, must_change_password, created_at, last_login_at
               FROM users WHERE 1 = 1`;
  const args = [];
  if (q) { sql += ' AND (name LIKE ? OR email LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  if (role) { sql += ' AND role = ?'; args.push(role); }
  if (!includeInactive) sql += ' AND active = 1';
  sql += ' ORDER BY active DESC, role, name';

  const users = await all(sql, args);
  const assignments = await all(
    `SELECT ta.user_id, s.name AS subject_name, sec.name AS section_name
       FROM teaching_assignments ta
       JOIN subjects s ON s.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
      WHERE ta.term_id = ?
      ORDER BY s.name, sec.name`,
    [term.id]
  );
  const byUser = new Map();
  for (const row of assignments) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ subjectName: row.subject_name, sectionName: row.section_name });
  }

  return {
    term: { id: term.id, name: term.name },
    users: users.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: Boolean(row.active),
      must_change_password: Boolean(row.must_change_password),
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      assignments: byUser.get(row.id) || []
    })),
    counts: {
      total: users.length,
      active: users.filter((row) => Number(row.active) === 1).length,
      hod: users.filter((row) => row.role === 'HOD' && Number(row.active) === 1).length,
      faculty: users.filter((row) => row.role === 'FACULTY' && Number(row.active) === 1).length
    }
  };
}

async function createUser(ctx) {
  const name = validate.str(ctx.body?.name, 'Name', { min: 2, max: 100 });
  const email = validate.email(ctx.body?.email);
  const role = validate.oneOf(ctx.body?.role, ['HOD', 'FACULTY'], 'Role');
  const provided = ctx.body?.password ? validate.password(ctx.body.password) : null;
  const password = provided || tempPassword();

  const existing = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email]);
  if (existing) throw new HttpError(409, 'EMAIL_IN_USE', 'That email address is already registered.');

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await run(
    `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
    [id, name, email, hash, role, new Date().toISOString()]
  );
  await writeAudit({
    userId: ctx.user.id,
    action: 'user.create',
    entity: 'user',
    entityId: id,
    after: { name, email, role },
    ip: ctx.ip
  });
  return {
    id,
    name,
    email,
    role,
    temporaryPassword: password,
    note: 'Share this temporary password once. The user must change it after signing in.'
  };
}

async function countOtherActiveHods(targetId) {
  const row = await get("SELECT COUNT(*) AS n FROM users WHERE role = 'HOD' AND active = 1 AND id <> ?", [targetId]);
  return Number(row?.n || 0);
}

async function updateUser(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'User not found.');

  const before = {
    name: target.name, email: target.email, role: target.role, active: Boolean(target.active)
  };
  const next = { ...before };

  if (validate.has(ctx.body, 'name')) next.name = validate.str(ctx.body.name, 'Name', { min: 2, max: 100 });
  if (validate.has(ctx.body, 'email')) {
    next.email = validate.email(ctx.body.email);
    const clash = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', [next.email, id]);
    if (clash) throw new HttpError(409, 'EMAIL_IN_USE', 'Another account already uses that email.');
  }
  if (validate.has(ctx.body, 'role')) {
    const role = validate.oneOf(ctx.body.role, ['HOD', 'FACULTY'], 'Role');
    if (id === ctx.user.id && role !== target.role) {
      throw new HttpError(400, 'SELF_ROLE', 'You cannot change your own role.');
    }
    next.role = role;
  }
  if (validate.has(ctx.body, 'active')) next.active = validate.bool(ctx.body.active, Boolean(target.active));

  const willRemainActiveHod = next.role === 'HOD' && next.active;
  if (target.role === 'HOD' && Number(target.active) === 1 && !willRemainActiveHod) {
    const others = await countOtherActiveHods(id);
    if (others === 0) {
      throw new HttpError(400, 'LAST_HOD', 'At least one active HOD must remain. Promote another HOD first.');
    }
  }
  if (id === ctx.user.id && !next.active) {
    throw new HttpError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account.');
  }

  await run(
    'UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?',
    [next.name, next.email, next.role, next.active ? 1 : 0, id]
  );
  if (!next.active) {
    await run('DELETE FROM sessions WHERE user_id = ?', [id]);
  }
  await writeAudit({
    userId: ctx.user.id,
    action: 'user.update',
    entity: 'user',
    entityId: id,
    before,
    after: next,
    ip: ctx.ip
  });
  return { id, ...next };
}

async function resetPassword(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  const password = tempPassword();
  const hash = await hashPassword(password);
  await run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, id]);
  await run('DELETE FROM sessions WHERE user_id = ?', [id]);
  await writeAudit({
    userId: ctx.user.id,
    action: 'user.reset_password',
    entity: 'user',
    entityId: id,
    ip: ctx.ip
  });
  return {
    temporaryPassword: password,
    note: 'This password is shown once. The user has been signed out everywhere.'
  };
}

module.exports = [
  { method: 'GET', path: 'users', handler: listUsers, hod: true },
  { method: 'POST', path: 'users', handler: createUser, hod: true },
  { method: 'PATCH', path: 'users/:id', handler: updateUser, hod: true },
  { method: 'POST', path: 'users/:id/reset-password', handler: resetPassword, hod: true }
];
