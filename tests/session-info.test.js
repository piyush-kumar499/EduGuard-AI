'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { maskIp, deviceLabel } = require('../lib/session-info');

test('maskIp hides the last IPv4 octet', () => {
  assert.equal(maskIp('203.0.113.45'), '203.0.113.•');
  assert.equal(maskIp('10.20.30.40'), '10.20.30.•');
});

test('maskIp trims IPv6 to its first groups', () => {
  assert.equal(maskIp('2001:db8:85a3:0:0:8a2e:370:7334'), '2001:db8:85a3:••••');
});

test('maskIp recognises IPv4-mapped and loopback addresses', () => {
  assert.equal(maskIp('::ffff:203.0.113.45'), '203.0.113.•');
  assert.equal(maskIp('::1'), 'localhost');
});

test('maskIp never returns an empty label', () => {
  assert.equal(maskIp(''), 'Unknown address');
  assert.equal(maskIp(null), 'Unknown address');
});

test('deviceLabel derives a readable browser and platform', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'), 'Safari on macOS');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0'), 'Edge on Windows');
  assert.equal(deviceLabel(''), 'Browser');
});
