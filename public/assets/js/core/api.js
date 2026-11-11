/* EduGuard API client. All calls are same-origin and cookie based. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};

  function ApiError(status, payload) {
    var error = payload && payload.error ? payload.error : {};
    this.name = 'ApiError';
    this.message = error.message || 'The request could not be completed.';
    this.status = status;
    this.code = error.code || 'REQUEST_FAILED';
    this.fields = error.fields || null;
    this.payload = payload || null;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function currentPath() {
    return window.location.pathname + window.location.search;
  }

  function loginRedirect() {
    if (window.location.pathname === '/login') return;
    var next = encodeURIComponent(currentPath());
    window.location.replace('/login?next=' + next);
  }

  async function request(path, options) {
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var body = options.body;
    if (body !== undefined && body !== null && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    var response;
    try {
      response = await fetch(path, {
        method: method,
        headers: headers,
        body: body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: options.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      var offline = new ApiError(0, { error: { code: 'NETWORK', message: 'You appear to be offline. Check the connection and try again.' } });
      throw offline;
    }

    var payload = null;
    var text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch (error) { payload = null; }
    }

    if (!response.ok || !payload || payload.ok === false) {
      if (response.status === 401 && !options.skipAuthRedirect) {
        EG.session && EG.session.clear();
        loginRedirect();
      }
      throw new ApiError(response.status, payload);
    }
    return payload.data;
  }

  function query(params) {
    if (!params) return '';
    var search = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach(function (item) { if (item !== '') search.append(key, item); });
      else search.set(key, String(value));
    });
    var text = search.toString();
    return text ? '?' + text : '';
  }

  async function download(path, fallbackName) {
    var response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { loginRedirect(); throw new ApiError(401, null); }
    if (!response.ok) {
      var payload = null;
      try { payload = await response.json(); } catch (error) { payload = null; }
      throw new ApiError(response.status, payload);
    }
    var blob = await response.blob();
    var disposition = response.headers.get('Content-Disposition') || '';
    var match = /filename="?([^";]+)"?/i.exec(disposition);
    var name = match ? match[1] : (fallbackName || 'eduguard-export.csv');
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    return name;
  }

  EG.api = {
    request: request,
    get: function (path, params, options) {
      return request(path + query(params), Object.assign({ method: 'GET' }, options || {}));
    },
    post: function (path, body, options) {
      return request(path, Object.assign({ method: 'POST', body: body === undefined ? {} : body }, options || {}));
    },
    put: function (path, body, options) {
      return request(path, Object.assign({ method: 'PUT', body: body === undefined ? {} : body }, options || {}));
    },
    patch: function (path, body, options) {
      return request(path, Object.assign({ method: 'PATCH', body: body === undefined ? {} : body }, options || {}));
    },
    del: function (path, body, options) {
      return request(path, Object.assign({ method: 'DELETE', body: body }, options || {}));
    },
    download: download,
    query: query,
    ApiError: ApiError
  };
})();
