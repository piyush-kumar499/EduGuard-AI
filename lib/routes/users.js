'use strict';

const crypto = require('crypto');
const { all, get, run, batch } = require('../db');
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
  const requireChange = validate.has(ctx.body, 'requireChange') ? validate.bool(ctx.body.requireChange, true) : true;
  const password = provided || tempPassword();
  const mustChange = provided ? (requireChange ? 1 : 0) : 1;

  const existing = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email]);
  if (existing) throw new HttpError(409, 'EMAIL_IN_USE', 'That email address is already registered.');

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await run(
    `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, name, email, hash, role, mustChange, new Date().toISOString()]
  );
  await writeAudit({
    userId: ctx.user.id,
    action: 'user.create',
    entity: 'user',
    entityId: id,
    after: { name, email, role, passwordSet: Boolean(provided), mustChangePassword: Boolean(mustChange) },
    ip: ctx.ip
  });
  return {
    id,
    name,
    email,
    role,
    temporaryPassword: provided ? null : password,
    passwordSet: Boolean(provided),
    mustChangePassword: Boolean(mustChange),
    note: provided
      ? (mustChange
        ? 'The account uses the password you set. The user must change it after signing in.'
        : 'The account uses the password you set.')
      : 'Share this temporary password once. The user must change it after signing in.'
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
    name: target.name, email: target.email, role: target.role, active: Boolean(target.active),
    mustChangePassword: Number(target.must_change_password) === 1
  };
  const next = { name: before.name, email: before.email, role: before.role, active: before.active };

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

  let passwordHash = null;
  if (ctx.body?.password) passwordHash = await hashPassword(validate.password(ctx.body.password));
  const mustChange = validate.has(ctx.body, 'mustChangePassword')
    ? validate.bool(ctx.body.mustChangePassword, Boolean(target.must_change_password))
    : Number(target.must_change_password) === 1;

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
    'UPDATE users SET name = ?, email = ?, role = ?, active = ?, must_change_password = ? WHERE id = ?',
    [next.name, next.email, next.role, next.active ? 1 : 0, mustChange ? 1 : 0, id]
  );
  if (passwordHash) {
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  }
  if (!next.active || passwordHash) {
    await run('DELETE FROM sessions WHERE user_id = ?', [id]);
  }
  await writeAudit({
    userId: ctx.user.id,
    action: passwordHash ? 'user.password_set' : 'user.update',
    entity: 'user',
    entityId: id,
    before,
    after: { ...next, mustChangePassword: Boolean(mustChange), passwordChanged: Boolean(passwordHash) },
    ip: ctx.ip
  });
  return { id, ...next, mustChangePassword: Boolean(mustChange), passwordChanged: Boolean(passwordHash) };
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

async function deleteUser(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  if (id === ctx.user.id) {
    throw new HttpError(409, 'SELF_DELETE', 'You cannot delete your own account.');
  }
  if (target.role !== 'FACULTY') {
    throw new HttpError(409, 'HOD_DELETE_FORBIDDEN', 'HOD accounts cannot be deleted. Deactivate the account or change the role instead.');
  }
  const confirmEmail = validate.str(ctx.body?.confirmEmail, 'Confirm email', { min: 1, max: 254 }).toLowerCase();
  if (confirmEmail !== String(target.email).trim().toLowerCase()) {
    throw new HttpError(422, 'CONFIRM_EMAIL', 'Type the account email exactly to confirm deletion.', {
      'Confirm email': 'Email does not match.'
    });
  }

  const [assessmentCount, attendanceCount, markCount, sessionCount, assignmentCount, actionCount] = await Promise.all([
    get('SELECT COUNT(*) AS n FROM assessments WHERE created_by = ?', [id]),
    get('SELECT COUNT(*) AS n FROM attendance_sessions WHERE created_by = ?', [id]),
    get('SELECT COUNT(*) AS n FROM marks WHERE updated_by = ?', [id]),
    get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', [id]),
    get('SELECT COUNT(*) AS n FROM teaching_assignments WHERE user_id = ?', [id]),
    get('SELECT COUNT(*) AS n FROM action_items WHERE user_id = ?', [id])
  ]);

  await batch([
    { sql: 'UPDATE assessments SET created_by = ? WHERE created_by = ?', args: [ctx.user.id, id] },
    { sql: 'UPDATE attendance_sessions SET created_by = ? WHERE created_by = ?', args: [ctx.user.id, id] },
    { sql: 'UPDATE marks SET updated_by = ? WHERE updated_by = ?', args: [ctx.user.id, id] },
    { sql: 'UPDATE mentor_assignments SET assigned_by = ? WHERE assigned_by = ?', args: [ctx.user.id, id] },
    { sql: 'DELETE FROM mentor_assignments WHERE mentor_id = ?', args: [id] },
    { sql: 'DELETE FROM action_items WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM teaching_assignments WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [id] }
  ]);

  const transferred = {
    assessments: Number(assessmentCount?.n || 0),
    attendanceSessions: Number(attendanceCount?.n || 0),
    marks: Number(markCount?.n || 0)
  };
  await writeAudit({
    userId: ctx.user.id,
    action: 'user.delete',
    entity: 'user',
    entityId: id,
    before: { name: target.name, email: target.email, role: target.role, active: Number(target.active) },
    after: {
      deleted: true,
      transferred,
      removed: {
        sessions: Number(sessionCount?.n || 0),
        assignments: Number(assignmentCount?.n || 0),
        actionItems: Number(actionCount?.n || 0)
      }
    },
    ip: ctx.ip
  });
  return { deleted: true, id, email: target.email, transferred };
}

module.exports = [
  { method: 'GET', path: 'users', handler: listUsers, hod: true },
  { method: 'POST', path: 'users', handler: createUser, hod: true },
  { method: 'PATCH', path: 'users/:id', handler: updateUser, hod: true },
  { method: 'DELETE', path: 'users/:id', handler: deleteUser, hod: true },
  { method: 'POST', path: 'users/:id/reset-password', handler: resetPassword, hod: true }
];
