(function initApiClient(){
  'use strict';

  function resolveBaseUrl() {
    try {
      if (typeof window !== 'undefined' && window.API_BASE_URL) return String(window.API_BASE_URL).replace(/\/+$/, '');
    } catch (_) {}
    try {
      if (typeof process !== 'undefined' && process && process.env && process.env.NEXT_PUBLIC_API_BASE_URL) {
        return String(process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, '');
      }
    } catch (_) {}
    try {
      if (typeof importMeta !== 'undefined' && importMeta && importMeta.env && importMeta.env.VITE_API_BASE_URL) {
        return String(importMeta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
      }
    } catch (_) {}
    throw new Error('Missing API base URL');
  }

  async function request(path, options) {
    var opts = options || {};
    var method = opts.method || 'GET';
    var body = opts.body;
    var token = opts.token;
    var url = resolveBaseUrl() + String(path || '');
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;

    var res = await fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    var text = await res.text();
    var data = text ? (function(){ try { return JSON.parse(text); } catch(_) { return null; } })() : null;
    if (!res.ok) {
      var msg = (data && data.error) || ('HTTP ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  async function getUserTier(token) {
    return request('/user', { token: token });
  }

  async function updateUserTier(token, tier) {
    return request('/user/update-tier', { method: 'POST', body: { tier: tier }, token: token });
  }

  async function listImages(token) {
    return request('/images/list', { token: token });
  }

  async function saveImage(token, fileName) {
    return request('/images/save', { method: 'POST', body: { fileName: fileName }, token: token });
  }

  async function getUploadUrl(token, fileName, contentType) {
    return request('/images/upload-url', { method: 'POST', body: { fileName: fileName, contentType: contentType }, token: token });
  }

  async function uploadToS3(uploadUrl, file, contentType) {
    var res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) throw new Error('S3 PUT failed: HTTP ' + res.status);
  }

  // Expose globally for non-module usage
  if (typeof window !== 'undefined') {
    window.apiClient = {
      getUserTier: getUserTier,
      updateUserTier: updateUserTier,
      listImages: listImages,
      saveImage: saveImage,
      getUploadUrl: getUploadUrl,
      uploadToS3: uploadToS3,
    };
  }
})();
