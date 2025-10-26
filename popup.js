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

  function setGreeting(name) {
    if (!greetingEl) return;
    if (name && String(name).trim().length > 0) {
      greetingEl.textContent = `Hello ${name}`;
    } else {
      greetingEl.textContent = '';
    }
  }

  try {
    if (isChromeAvailable()) {
      chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn'], (data) => {
        const signedIn = !!(data && data.cognitoSignedIn);
        const name = data && typeof data.cognitoUserName === 'string' ? data.cognitoUserName : '';
        setGreeting(signedIn ? name : '');
      });
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          const name = changes.cognitoUserName && changes.cognitoUserName.newValue;
          const signedInChange = changes.cognitoSignedIn && changes.cognitoSignedIn.newValue;
          if (typeof name !== 'undefined' || typeof signedInChange !== 'undefined') {
            chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn'], (d) => {
              setGreeting(d && d.cognitoSignedIn ? d.cognitoUserName : '');
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
