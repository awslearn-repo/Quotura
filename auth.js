(function initAuth(){
  'use strict';

  /**
   * Returns a valid Cognito JWT for Authorization: Bearer <JWT>.
   * Implement this by integrating your auth provider (Amplify, Cognito Hosted UI, etc.).
   * This stub attempts to read an existing token from storage as a convenience.
   */
  async function getAuthToken() {
    // If you wire token storage later as chrome.storage.local.set({ cognitoIdToken: '<JWT>' })
    // this will start working automatically. Otherwise, replace this implementation.
    try {
      if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
        const token = await new Promise((resolve) => {
          try {
            chrome.storage.local.get(['cognitoIdToken'], (data) => resolve((data && data.cognitoIdToken) || null));
          } catch (_) {
            resolve(null);
          }
        });
        if (token && typeof token === 'string' && token.split('.').length === 3) return token;
      }
      // Fallback to localStorage (for dev/testing outside extension context)
      try {
        if (typeof localStorage !== 'undefined') {
          const token = localStorage.getItem('cognitoIdToken');
          if (token && token.split('.').length === 3) return token;
        }
      } catch (_) {}
    } catch (_) {}

    // Default: instruct the developer to implement
    throw new Error('Implement getAuthToken() to return a Cognito JWT');
  }

  // Expose globally for non-module scripts
  if (typeof window !== 'undefined') {
    window.getAuthToken = getAuthToken;
  }
})();
