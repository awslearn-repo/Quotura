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
      try {
        const update = (tier) => {
          const planSuffix = tier ? (tier === 'pro' ? ' — Pro plan' : ' — Free plan') : '';
          greetingEl.textContent = `Hello ${name}${planSuffix}`;
        };
        if (isChromeAvailable()) {
          chrome.storage.local.get(['userTier'], (d) => update(d && d.userTier));
        } else {
          update(localStorage.getItem('userTier'));
        }
      } catch (_) {
        greetingEl.textContent = `Hello ${name}`;
      }
    } else {
      greetingEl.textContent = '';
    }
  }

  try {
    if (isChromeAvailable()) {
      chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn', 'userTier'], (data) => {
        const signedIn = !!(data && data.cognitoSignedIn);
        const name = data && typeof data.cognitoUserName === 'string' ? data.cognitoUserName : '';
        if (signedIn) {
          const tier = data && typeof data.userTier === 'string' ? data.userTier : null;
          if (name) {
            const planSuffix = tier ? (tier === 'pro' ? ' — Pro plan' : ' — Free plan') : '';
            greetingEl.textContent = `Hello ${name}${planSuffix}`;
          } else {
            setGreeting('');
          }
        } else {
          setGreeting('');
        }
      });
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          const nameChange = changes.cognitoUserName && changes.cognitoUserName.newValue;
          const signedInChange = changes.cognitoSignedIn && changes.cognitoSignedIn.newValue;
          const tierChange = changes.userTier && changes.userTier.newValue;
          if (typeof nameChange !== 'undefined' || typeof signedInChange !== 'undefined' || typeof tierChange !== 'undefined') {
            chrome.storage.local.get(['cognitoUserName', 'cognitoSignedIn', 'userTier'], (d) => {
              const show = d && d.cognitoSignedIn ? d.cognitoUserName : '';
              if (show) {
                const planSuffix = d && d.userTier ? (d.userTier === 'pro' ? ' — Pro plan' : ' — Free plan') : '';
                greetingEl.textContent = `Hello ${show}${planSuffix}`;
              } else {
                setGreeting('');
              }
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
