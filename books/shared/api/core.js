import config from '../config.js';
import { getAccessToken } from '../supabase-client.js';

async function request(method, path, { body, headers: extra } = {}) {
  const token = await getAccessToken();
  const headers = { ...extra };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${config.apiBase}${path}`;
  const opts = { method, headers };

  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
      // Let the browser set Content-Type with boundary for multipart
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, opts);

  if (!res.ok) {
    let detail;
    try { detail = await res.json(); } catch { detail = { message: res.statusText }; }
    const err = new Error(detail.message || detail.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export const api = {
  get:    (path, opts) => request('GET',    path, opts),
  post:   (path, opts) => request('POST',   path, opts),
  patch:  (path, opts) => request('PATCH',  path, opts),
  put:    (path, opts) => request('PUT',    path, opts),
  delete: (path, opts) => request('DELETE', path, opts),
};

