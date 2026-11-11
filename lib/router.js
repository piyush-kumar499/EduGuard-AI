'use strict';

const RAW = Symbol('raw-response');

function createRouter() {
  const routes = [];

  function add(route) {
    const pattern = route.path.replace(/^\/+|\/+$/g, '');
    routes.push({
      method: route.method.toUpperCase(),
      pattern,
      segments: pattern ? pattern.split('/') : [],
      handler: route.handler,
      options: route
    });
  }

  function addAll(list) {
    for (const route of list) add(route);
  }

  function match(method, path) {
    const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = segments[index];
        if (expected.startsWith(':')) {
          params[expected.slice(1)] = decodeURIComponent(actual);
        } else if (expected === '*') {
          params.rest = segments.slice(index).join('/');
          break;
        } else if (expected !== actual) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  function list() {
    return routes.map((route) => `${route.method} /api/${route.pattern}`);
  }

  return { add, addAll, match, list };
}

module.exports = { createRouter, RAW };
