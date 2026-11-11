'use strict';

class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.fields = fields || undefined;
  }
}

function badRequest(message, code = 'BAD_REQUEST', fields) {
  return new HttpError(400, code, message, fields);
}

function unauthorized(message = 'Please sign in to continue.', code = 'UNAUTHORIZED') {
  return new HttpError(401, code, message);
}

function forbidden(message = 'You do not have access to this resource.', code = 'FORBIDDEN') {
  return new HttpError(403, code, message);
}

function notFound(message = 'Not found.', code = 'NOT_FOUND') {
  return new HttpError(404, code, message);
}

function conflict(message, code = 'CONFLICT') {
  return new HttpError(409, code, message);
}

function tooMany(message, retryAfter, code = 'RATE_LIMITED') {
  const error = new HttpError(429, code, message);
  error.retryAfter = retryAfter;
  return error;
}

function str(value, label, { min = 0, max = 200, required = true, trim = true } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') value = String(value);
  const result = trim ? value.trim() : value;
  if (!result && required) throw badRequest(`${label} is required.`, 'VALIDATION', { [label]: `${label} is required.` });
  if (result.length < min) throw badRequest(`${label} must be at least ${min} characters.`, 'VALIDATION', { [label]: `${label} must be at least ${min} characters.` });
  if (result.length > max) throw badRequest(`${label} must be at most ${max} characters.`, 'VALIDATION', { [label]: `${label} must be at most ${max} characters.` });
  return result;
}

function email(value, label = 'Email') {
  const result = str(value, label, { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw badRequest('Enter a valid email address.', 'VALIDATION', { [label]: 'Enter a valid email address.' });
  }
  return result;
}

function id(value, label = 'Id') {
  const result = str(value, label, { min: 1, max: 80 });
  return result;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'off') return false;
  return fallback;
}

function num(value, label, { min = -Infinity, max = Infinity, required = true, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required && fallback !== undefined) return fallback;
    throw badRequest(`${label} is required.`, 'VALIDATION', { [label]: `${label} is required.` });
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw badRequest(`${label} must be a number.`, 'VALIDATION', { [label]: `${label} must be a number.` });
  if (result < min) throw badRequest(`${label} must be at least ${min}.`, 'VALIDATION', { [label]: `${label} must be at least ${min}.` });
  if (result > max) throw badRequest(`${label} must be at most ${max}.`, 'VALIDATION', { [label]: `${label} must be at most ${max}.` });
  return result;
}

function int(value, label, options = {}) {
  const result = num(value, label, options);
  if (!Number.isInteger(result)) throw badRequest(`${label} must be a whole number.`, 'VALIDATION', { [label]: `${label} must be a whole number.` });
  return result;
}

function date(value, label, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw badRequest(`${label} is required.`, 'VALIDATION', { [label]: `${label} is required.` });
  }
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw badRequest(`${label} must be a valid date (YYYY-MM-DD).`, 'VALIDATION', { [label]: `${label} must be a valid date (YYYY-MM-DD).` });
  }
  return text;
}

function oneOf(value, allowed, label) {
  const result = str(value, label, { max: 80 });
  if (!allowed.includes(result)) {
    throw badRequest(`${label} must be one of: ${allowed.join(', ')}.`, 'VALIDATION', { [label]: `Choose a valid ${label.toLowerCase()}.` });
  }
  return result;
}

function array(value, label, { min = 0, max = 5000 } = {}) {
  if (!Array.isArray(value)) throw badRequest(`${label} must be a list.`, 'VALIDATION');
  if (value.length < min) throw badRequest(`${label} needs at least ${min} item(s).`, 'VALIDATION');
  if (value.length > max) throw badRequest(`${label} has too many items (max ${max}).`, 'VALIDATION');
  return value;
}

function password(value) {
  const result = str(value, 'Password', { min: 10, max: 200, trim: false });
  if (!/[A-Za-z]/.test(result) || !/[0-9]/.test(result)) {
    throw badRequest('Password must be at least 10 characters and include a letter and a number.', 'VALIDATION', {
      Password: 'At least 10 characters with a letter and a number.'
    });
  }
  return result;
}

function pagination(query = {}) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  let offset = 0;
  if (query.cursor) {
    const decoded = Buffer.from(String(query.cursor), 'base64').toString('utf8');
    const parsed = Number(decoded);
    offset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } else if (query.offset) {
    offset = Math.max(0, Number(query.offset) || 0);
  }
  return {
    limit,
    offset,
    nextCursor(returned, total) {
      if (offset + returned >= total) return null;
      return Buffer.from(String(offset + returned)).toString('base64');
    }
  };
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

module.exports = {
  HttpError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany,
  str, email, id, bool, num, int, date, oneOf, array, password, pagination, has
};
