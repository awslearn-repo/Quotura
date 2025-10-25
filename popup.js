(function initPopup() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopup, { once: true });
    return;
  }
  const greetingEl = document.getElementById('greeting');
  if (!greetingEl) return;

  function isChromeAvailable() {
    try { return !!(window.chrome && chrome.storage && chrome.storage.local); } catch (_) { return false; }
  }

  function looksLikeOpaqueId(value) {
    try {
      const s = String(value || '').trim();
      if (!s) return false;
      if (/\s/.test(s)) return false;
      if (/@/.test(s)) return false; // email is acceptable fallback
      return /^[A-Za-z0-9_-]{8,}$/.test(s);
    } catch (_) {
      return false;
    }
  }

  function setGreeting(name) {
    if (!greetingEl) return;
    const s = String(name || '').trim();
    if (s && !looksLikeOpaqueId(s)) {
      greetingEl.textContent = `Hello ${s}`;
    } else {
      greetingEl.textContent = '';
    }
  }

  try {
    if (isChromeAvailable()) {
      chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn', 'cognitoIdToken'], (data) => {
        const signedIn = !!(data && data.cognitoSignedIn);
        let name = data && typeof data.cognitoUserName === 'string' ? data.cognitoUserName : '';
        // If name looks like an opaque id, try to derive from id token claims
        if (signedIn && looksLikeOpaqueId(name) && typeof data.cognitoIdToken === 'string') {
          try {
            const parts = data.cognitoIdToken.split('.');
            if (parts.length >= 2) {
              const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
              const fullName = (payload.name && String(payload.name).trim()) || null;
              const given = (payload.given_name && String(payload.given_name).trim()) || '';
              const family = (payload.family_name && String(payload.family_name).trim()) || '';
              const email = (payload.email && String(payload.email).trim()) || null;
              name = fullName || [given, family].filter(Boolean).join(' ') || email || name;
              if (name && typeof name === 'string') {
                chrome.storage.local.set({ cognitoUserName: name });
              }
            }
          } catch (_) {}
        }
        setGreeting(signedIn ? name : '');
      });
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          const name = changes.cognitoUserName && changes.cognitoUserName.newValue;
          const signedInChange = changes.cognitoSignedIn && changes.cognitoSignedIn.newValue;
          if (typeof name !== 'undefined' || typeof signedInChange !== 'undefined') {
            chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn', 'cognitoIdToken'], (d) => {
              const signed = !!(d && d.cognitoSignedIn);
              let nm = d && typeof d.cognitoUserName === 'string' ? d.cognitoUserName : '';
              if (signed && looksLikeOpaqueId(nm) && typeof d.cognitoIdToken === 'string') {
                try {
                  const parts = d.cognitoIdToken.split('.');
                  if (parts.length >= 2) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
                    const fullName = (payload.name && String(payload.name).trim()) || null;
                    const given = (payload.given_name && String(payload.given_name).trim()) || '';
                    const family = (payload.family_name && String(payload.family_name).trim()) || '';
                    const email = (payload.email && String(payload.email).trim()) || null;
                    nm = fullName || [given, family].filter(Boolean).join(' ') || email || nm;
                    if (nm && typeof nm === 'string') {
                      chrome.storage.local.set({ cognitoUserName: nm });
                    }
                  }
                } catch (_) {}
              }
              setGreeting(signed ? nm : '');
            });
          }
        });
      }
    } else {
      const lsSignedIn = localStorage.getItem('cognitoSignedIn') === 'true';
      const lsName = localStorage.getItem('cognitoUserName') || '';
      setGreeting(lsSignedIn ? lsName : '');
    }
  } catch (_) {}
})();
