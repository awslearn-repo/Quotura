(function initApiConfig(){
  try {
    // Configure the base URL for the backend API (extension-friendly)
    // You can change this at build time or override via env if bundling.
    var explicitBase = 'https://ffngxtofyb.execute-api.us-east-1.amazonaws.com/dev';
    var fromEnvNext = (typeof process !== 'undefined' && process && process.env && process.env.NEXT_PUBLIC_API_BASE_URL) ? process.env.NEXT_PUBLIC_API_BASE_URL : '';
    var fromEnvVite = (typeof importMeta !== 'undefined' && importMeta && importMeta.env && importMeta.env.VITE_API_BASE_URL) ? importMeta.env.VITE_API_BASE_URL : '';

    var resolved = String(fromEnvNext || fromEnvVite || explicitBase || '').trim();
    if (!resolved) throw new Error('Missing API base URL');

    // Expose as global for non-module scripts
    if (!window) return; // non-browser guard
    window.API_BASE_URL = resolved.replace(/\/+$/, '');
  } catch (e) {
    // Leave helpful trace; downstream will throw when used
    try { console.warn('API base URL configuration failed:', e); } catch (_) {}
  }
})();
