'use strict';

/**
 * Presentation helpers for the active-sessions list. Kept pure so they can be
 * unit tested without a database.
 */

function maskIp(value) {
  const ip = String(value || '').trim();
  if (!ip) return 'Unknown address';
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return 'localhost';
  if (/^::ffff:/i.test(ip)) return maskIp(ip.slice(7));
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return (parts.slice(0, 3).join(':') || 'IPv6') + ':••••';
  }
  const parts = ip.split('.');
  if (parts.length === 4) return parts.slice(0, 3).join('.') + '.•';
  return ip;
}

function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Mac OS X/.test(ua) ? 'macOS'
          : /Linux/.test(ua) ? 'Linux'
            : '';
  return os ? browser + ' on ' + os : browser;
}

module.exports = { maskIp, deviceLabel };
