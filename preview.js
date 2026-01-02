// Wait for DOM to fully load before executing script
// This ensures all HTML elements are available for manipulation
(function initPreviewScript() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreviewScript, { once: true });
    return;
  }
  // Get references to key DOM elements
  const img = document.getElementById("image");                    // Image container for generated quote
  const msg = document.getElementById("message");                  // Status message element
  const downloadPngBtn = document.getElementById("downloadPngBtn"); // PNG download button
  const downloadSvgBtn = document.getElementById("downloadSvgBtn"); // SVG download button
  const copyImageBtn = document.getElementById("copyImageBtn");     // Copy to clipboard button
  const removeWatermarkBtn = document.getElementById("removeWatermarkBtn"); // Remove watermark button
  const quickEditBtn = document.getElementById("quickEditBtn");             // Quick edit button
  const editPanel = document.getElementById("editPanel");                   // Edit panel container
  const fontBtn = document.getElementById("fontBtn");                       // Font selection button
  const decreaseSizeBtn = document.getElementById("decreaseSizeBtn");       // Decrease size button
  const increaseSizeBtn = document.getElementById("increaseSizeBtn");       // Increase size button
  const currentSizeDisplay = document.getElementById("currentSize");        // Current size display
  const doneBtn = document.getElementById("doneBtn");                       // Done button
  const backgroundBtn = document.getElementById("backgroundBtn");           // Background selection button
  const inlineEditor = document.getElementById("inlineEditor");             // Inline editor overlay
  const editBackground = document.getElementById("editBackground");          // Background layer during editing
  const boldBtn = document.getElementById("boldBtn");                         // Bold formatting button
  const italicBtn = document.getElementById("italicBtn");                     // Italic formatting button
  const underlineBtn = document.getElementById("underlineBtn");               // Underline formatting button
  // Auth UI elements
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const resumeAuthBtn = document.getElementById("resumeAuthBtn");
  const authStatus = document.getElementById("authStatus");
  const userGreeting = document.getElementById("userGreeting");
  
  // Helpers to decode JWT and extract a friendly display name
  function base64UrlDecodeToString(base64Url) {
    try {
      let s = String(base64Url || "").replace(/-/g, "+").replace(/_/g, "/");
      const pad = s.length % 4;
      if (pad) s += "=".repeat(4 - pad);
      const binary = atob(s);
      try {
        return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
      } catch (_) {
        return binary;
      }
    } catch (_) {
      return "";
    }
  }

  function decodeJwtPayload(jwt) {
    try {
      const parts = String(jwt || "").split(".");
      if (parts.length < 2) return null;
      const payloadJson = base64UrlDecodeToString(parts[1]);
      return JSON.parse(payloadJson);
    } catch (_) {
      return null;
    }
  }

  function extractDisplayNameFromClaims(claims) {
    if (!claims || typeof claims !== 'object') return null;
    // Prefer real name fields; avoid using raw Cognito username/user id
    const raw = claims.given_name || claims.name || claims.preferred_username || claims.email || null;
    if (!raw) return null;
    const candidate = /@/.test(raw) ? raw.split('@')[0] : raw;
    try {
      return candidate
        .split(/\s+|[_-]/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    } catch (_) {
      return String(candidate);
    }
  }

  function storeUserName(name) {
    try {
      if (!name) return;
      if (isChromeAvailable()) {
        chrome.storage.local.set({ cognitoUserName: name });
      } else {
        localStorage.setItem('cognitoUserName', name);
      }
    } catch (_) {}
  }
  
  // State variables
  let currentImageData = null;
  let watermarkRemoved = false;
  let editMode = false;
    let currentFont = "Arial";
    let currentFontSize = 28;
  let currentGradientChoice = null; // null means random
  let currentText = null;           // Current editable text content
  let currentTextHtml = null;       // Current editable HTML content with formatting
  let regenerateDebounceId = null;  // Debounce timer id for live updates
  let inlineEditing = false;        // Whether inline editor is visible
  let userIsPro = false;            // Current gating flag
  let ensuredWatermarkForFree = false; // Ensure watermark once for free tier users
  let startAuthFlowForUpgrade = null;   // Deferred auth launcher for upgrade path

    if (currentSizeDisplay) {
      currentSizeDisplay.textContent = currentFontSize;
    }

    function persistFontSettings(fontValue, sizeValue) {
      const updates = {};
      if (typeof fontValue === 'string' && fontValue.trim().length > 0) {
        updates.quoteFont = fontValue.trim();
      }
      if (Number.isFinite(sizeValue) && sizeValue > 0) {
        updates.quoteFontSize = Math.round(sizeValue);
      }
      try {
        if (Object.keys(updates).length === 0) return;
        if (isChromeAvailable()) {
          chrome.storage.local.set(updates);
        } else if (typeof localStorage !== 'undefined') {
          if (updates.quoteFont) localStorage.setItem('quoteFont', updates.quoteFont);
          if (updates.quoteFontSize) localStorage.setItem('quoteFontSize', String(updates.quoteFontSize));
        }
      } catch (_) {}
    }

    try {
      if (isChromeAvailable()) {
        chrome.storage.local.get(["quoteFont", "quoteFontSize"], (data) => {
          try {
            if (data && typeof data.quoteFont === 'string' && data.quoteFont.trim().length > 0) {
              currentFont = data.quoteFont.trim();
            }
            if (data && (typeof data.quoteFontSize === 'number' || typeof data.quoteFontSize === 'string')) {
              const parsed = Number.parseInt(data.quoteFontSize, 10);
              if (!Number.isNaN(parsed) && parsed > 0) {
                currentFontSize = parsed;
              }
            }
            if (currentSizeDisplay) currentSizeDisplay.textContent = currentFontSize;
          } catch (_) {}
        });
      } else if (typeof localStorage !== 'undefined') {
        const storedFont = localStorage.getItem('quoteFont');
        if (storedFont && storedFont.trim().length > 0) {
          currentFont = storedFont.trim();
        }
        const storedSize = localStorage.getItem('quoteFontSize');
        if (storedSize) {
          const parsed = Number.parseInt(storedSize, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            currentFontSize = parsed;
          }
        }
        if (currentSizeDisplay) currentSizeDisplay.textContent = currentFontSize;
      }
    } catch (_) {}

  // Centralized Cognito configuration and URL builders
  const COGNITO_CONFIG = {
    domain: "https://us-east-1mguj75ffn.auth.us-east-1.amazoncognito.com",
    clientId: "4nak1safpk5ueahr20cr2n4vta",
    redirectUri: "chrome-extension://dlnlebhcjcjkpbggdloipihaobpmlbld/preview.html",
    scopes: ["email", "openid"],
  };

  // Backend API configuration
  const API_BASE_URL = "https://quotura.imaginetechverse.com/api";
  const API_ENDPOINTS = {
    user: `${API_BASE_URL}/user`,
    createTempSession: `${API_BASE_URL}/create-temp-session`,
  };

  const UPGRADE_PAGE_URL = "https://quotura.imaginetechverse.com/plans.html";

  function buildCognitoAuthUrl(action, config, overrideRedirectUri) {
    const url = new URL(`/${action}`, config.domain);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", overrideRedirectUri || config.redirectUri);
    url.searchParams.set("response_type", "code");
    if (Array.isArray(config.scopes) && config.scopes.length > 0) {
      url.searchParams.set("scope", config.scopes.join(" "));
    }
    return url.toString();
  }

  function buildCognitoLogoutUrl(config) {
    const url = new URL("/logout", config.domain);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("logout_uri", config.redirectUri);
    return url.toString();
  }

  function getCognitoTokenUrl(config) {
    return new URL('/oauth2/token', config.domain).toString();
  }

  async function exchangeAuthCodeForTokens(authCode, redirectUriUsed) {
    try {
      if (!authCode) return null;
      const tokenUrl = getCognitoTokenUrl(COGNITO_CONFIG);
      const body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('client_id', COGNITO_CONFIG.clientId);
      body.set('code', authCode);
      body.set('redirect_uri', redirectUriUsed || COGNITO_CONFIG.redirectUri);
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      const idToken = json && json.id_token;
      const accessToken = json && json.access_token;
      if (!idToken) return null;
      const claims = decodeJwtPayload(idToken);
      const name = extractDisplayNameFromClaims(claims);
      storeUserName(name);
      // Store both tokens (some APIs expect access_token, others accept id_token)
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.set({
            cognitoIdToken: idToken,
            cognitoAccessToken: (typeof accessToken === 'string' && accessToken.trim().length > 0) ? accessToken : null,
          });
        }
      } catch (_) {}
      return name || null;
    } catch (_) {
      return null;
    }
  }

  async function getAuthTokensFromStorage() {
    return new Promise((resolve) => {
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.get(["cognitoIdToken", "cognitoAccessToken"], (data) => {
            resolve({
              idToken: (data && typeof data.cognitoIdToken === "string") ? data.cognitoIdToken : null,
              accessToken: (data && typeof data.cognitoAccessToken === "string") ? data.cognitoAccessToken : null,
            });
          });
        } else {
          resolve({
            idToken: localStorage.getItem("cognitoIdToken") || null,
            accessToken: localStorage.getItem("cognitoAccessToken") || null,
          });
        }
      } catch (_) {
        resolve({ idToken: null, accessToken: null });
      }
    });
  }

  async function getIdTokenFromStorage() {
    return new Promise((resolve) => {
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.get(["cognitoIdToken"], (data) => {
            resolve((data && typeof data.cognitoIdToken === "string") ? data.cognitoIdToken : null);
          });
        } else {
          resolve(localStorage.getItem("cognitoIdToken") || null);
        }
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function fetchUserTierAndStore() {
    try {
      const idToken = await getIdTokenFromStorage();
      if (!idToken) return null;
      const resp = await fetch(API_ENDPOINTS.user, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: "application/json",
        },
        credentials: "omit",
        cache: "no-store",
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      const tier = json && (json.tier === "pro" ? "pro" : "free");
      const trialStartDate = json && typeof json.trialStartDate === "string" ? json.trialStartDate : null;
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.set({ userTier: tier, userTrialStartDate: trialStartDate || null });
        } else {
          localStorage.setItem("userTier", tier || "");
          if (trialStartDate) localStorage.setItem("userTrialStartDate", trialStartDate);
        }
      } catch (_) {}
      return { tier, trialStartDate };
    } catch (_) {
      return null;
    }
  }

  function applyGreetingIfAvailable(signedIn) {
    try {
      if (!signedIn) {
        if (userGreeting) userGreeting.textContent = '';
        return; // default auth text handled elsewhere
      }
      const setGreetingTexts = (name, tier) => {
        const hasName = name && String(name).trim().length > 0;
        const planSuffix = tier ? (tier === 'pro' ? ' - Pro plan' : ' - Free plan') : '';
        if (userGreeting) userGreeting.textContent = hasName ? `Hello ${name}${planSuffix}` : '';
        // Ensure greeting width aligns with image after text updates
        try { setTimeout(syncEditOverlayToImage, 0); } catch (_) {}
      };
      const updateFromStorage = () => {
        chrome.storage.local.get(['cognitoUserName', 'cognitoIdToken', 'userTier'], (data) => {
          let name = data && typeof data.cognitoUserName === 'string' ? data.cognitoUserName : null;
          if (!name && data && typeof data.cognitoIdToken === 'string') {
            const claims = decodeJwtPayload(data.cognitoIdToken);
            const computed = extractDisplayNameFromClaims(claims);
            if (computed && computed.trim().length > 0) {
              name = computed;
              try { chrome.storage.local.set({ cognitoUserName: computed }); } catch (_) {}
            }
          }
          const tier = data && typeof data.userTier === 'string' ? data.userTier : null;
          setGreetingTexts(name, tier);
        });
      };
      if (isChromeAvailable()) {
        updateFromStorage();
      } else {
        const name = localStorage.getItem('cognitoUserName');
        const tier = localStorage.getItem('userTier');
        setGreetingTexts(name, tier);
      }
    } catch (_) {}
  }

  // ---- Pro plan gating helpers ----
  function applyPlanGating(tier) {
    try {
      userIsPro = (tier === 'pro');
      const upgradeBtn = document.getElementById('upgradeBtn');
      const editHint = document.getElementById('editHint');

      // Toggle upgrade button visibility ? only for signed-in free users
      const setUpgradeVisibility = (signedIn) => {
        if (!upgradeBtn) return;
        upgradeBtn.style.display = (signedIn && !userIsPro) ? 'inline-block' : 'none';
      };
      if (isChromeAvailable()) {
        try {
          chrome.storage.local.get(['cognitoSignedIn'], (data) => {
            setUpgradeVisibility(!!(data && data.cognitoSignedIn));
          });
        } catch (_) {
          setUpgradeVisibility(false);
        }
      } else {
        const v = (typeof localStorage !== 'undefined') ? localStorage.getItem('cognitoSignedIn') : 'false';
        setUpgradeVisibility(v === 'true');
      }

      // Lock/unlock the right editor panel
      if (editPanel) {
        editPanel.classList.toggle('locked', !userIsPro);
      }

      // Update inline editor editability and cursor
      if (inlineEditor) {
        if (userIsPro) {
          inlineEditor.setAttribute('contenteditable', 'true');
          inlineEditor.style.cursor = 'text';
        } else {
          inlineEditor.setAttribute('contenteditable', 'false');
          inlineEditor.style.cursor = 'not-allowed';
        }
      }

      // Update Remove Watermark button label for free users (keep clickable to show upgrade)
      if (removeWatermarkBtn) {
        if (!userIsPro && !watermarkRemoved) {
          removeWatermarkBtn.textContent = 'Remove Watermark (Pro)';
        } else if (!watermarkRemoved) {
          removeWatermarkBtn.textContent = 'Remove Watermark';
        }
      }

      // Update instructional hint
      if (editHint) {
        if (userIsPro) {
          editHint.textContent = 'Tip: click the image to edit the quote. The right panel will appear.';
        } else {
          editHint.textContent = 'Tip: click the image to preview editing. Upgrade to Pro to edit.';
        }
      }

      // Ensure overlays align after layout changes
      try { setTimeout(syncEditOverlayToImage, 0); } catch (_) {}

      // Hard-ensure watermark for Free users (once per load)
      if (!userIsPro && !ensuredWatermarkForFree && isChromeAvailable()) {
        ensuredWatermarkForFree = true;
        try {
          chrome.storage.local.get(["quoteText", "quoteTextHtml"], (data) => {
            const hasText = data && typeof data.quoteText === 'string' && data.quoteText.length > 0;
            if (!hasText) return;
            const incomingHtml = (typeof data.quoteTextHtml === 'string' && data.quoteTextHtml.length > 0) ? data.quoteTextHtml : null;
            const payload = {
              action: "regenerateWithSettings",
              text: data.quoteText,
              html: incomingHtml,
              font: currentFont,
              fontSize: currentFontSize,
              includeWatermark: true,
              gradient: currentGradientChoice,
            };
            chrome.runtime.sendMessage(payload, (response) => {
              if (response && response.imageData) {
                currentImageData = response.imageData;
                if (img) img.src = response.imageData;
                watermarkRemoved = false;
                // Keep export buttons enabled state consistent for free plan
                enableExportButtons();
              }
            });
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  function applyPlanGatingFromStorage() {
    try {
      if (isChromeAvailable()) {
        chrome.storage.local.get(['userTier'], (data) => {
          const tier = data && data.userTier === 'pro' ? 'pro' : 'free';
          applyPlanGating(tier);
        });
      } else {
        const tier = (localStorage.getItem('userTier') === 'pro') ? 'pro' : 'free';
        applyPlanGating(tier);
      }
    } catch (_) {}
  }

  // Update background layer to reflect current gradient selection
  function updateEditBackgroundGradient() {
    if (!editBackground) return;
    const applyGradient = (colors) => {
      try {
        if (Array.isArray(colors) && colors.length >= 2) {
          editBackground.style.background = `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
        } else {
          editBackground.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
      } catch (_) {
        editBackground.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      }
    };
    const applyImage = (url) => {
      try {
        if (url) {
          editBackground.style.background = `url(${url}) center/cover no-repeat`;
          return true;
        }
      } catch (_) {}
      return false;
    };
    if (currentGradientChoice) {
      applyGradient(currentGradientChoice);
      return;
    }
    if (isChromeAvailable()) {
      chrome.storage.local.get(["customBackgroundImage", "currentGradient"], (data) => {
        if (data && data.customBackgroundImage) {
          if (!applyImage(data.customBackgroundImage)) {
            applyGradient((data && data.currentGradient) || null);
          }
        } else {
          applyGradient((data && data.currentGradient) || null);
        }
      });
    } else {
      applyGradient(null);
    }
  }

  // Ensure edit overlays and greeting match the rendered image size exactly
  function syncEditOverlayToImage() {
    try {
      if (!img) return;
      const imageWidth = img.clientWidth;
      const imageHeight = img.clientHeight;
      if (!imageWidth || !imageHeight) return;

      // Match background size to image
      if (editBackground) {
        editBackground.style.width = `${imageWidth}px`;
        editBackground.style.height = `${imageHeight}px`;
      }

      // Keep editor width aligned with image for consistent typing area
      if (inlineEditor) {
        inlineEditor.style.width = `${imageWidth}px`;
        inlineEditor.style.maxWidth = `${imageWidth}px`;
      }

      // Align greeting container width and centering with the image so left edges match
      if (userGreeting) {
        userGreeting.style.width = `${imageWidth}px`;
        userGreeting.style.maxWidth = `${imageWidth}px`;
        // Center horizontally so its left edge aligns with the centered image
        userGreeting.style.marginLeft = 'auto';
        userGreeting.style.marginRight = 'auto';
      }
    } catch (_) {}
  }

  // Keep overlays in sync with image dimensions on load and resize
  if (img) {
    img.addEventListener('load', syncEditOverlayToImage, { once: false });
  }
  window.addEventListener('resize', syncEditOverlayToImage, { passive: true });

  function showEditingVisuals() {
    // Ensure overlay matches current image size before showing
    syncEditOverlayToImage();
    // For Pro users, show the editable background and hide the image under it.
    // For Free or signed-out users, keep the watermarked image visible and do not show the overlay.
    if (userIsPro) {
      if (editBackground) editBackground.classList.add('active');
      if (img) img.style.visibility = 'hidden';
    } else {
      if (editBackground) editBackground.classList.remove('active');
      if (img) img.style.visibility = 'visible';
    }
    updateEditBackgroundGradient();
  }

  function hideEditingVisuals() {
    if (editBackground) editBackground.classList.remove('active');
    if (img) img.style.visibility = 'visible';
  }

  function isChromeAvailable() {
    try {
      return !!(window.chrome && chrome.runtime && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
  }
  
  // Initialize the preview page
    try {
      initializeAuth();
      initializePreview();
  } catch (e) {
    console.warn('initializePreview failed', e);
    msg.textContent = "Open via the extension to generate the image.";
    // Keep UI responsive
    // Enable buttons that don't require Chrome APIs
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    copyImageBtn.disabled = true;
    removeWatermarkBtn.disabled = true;
  }
  
  /**
   * Initialize Cognito Hosted UI auth flow (login/signup/logout)
   * - Uses provided Hosted UI URL
   * - Treats presence of ?code=... as "signed in" for now
   */
  function initializeAuth() {
    // Generate Hosted UI URLs from config
    const loginUrlString = buildCognitoAuthUrl("login", COGNITO_CONFIG);
    const signupUrlString = buildCognitoAuthUrl("signup", COGNITO_CONFIG);

    // Auth popup overlay elements
    const authOverlay = document.getElementById("authPopupOverlay");
    const authOpenExternalBtn = document.getElementById("authPopupOpenExternalBtn");
    const authCloseBtn = document.getElementById("authPopupCloseBtn");
    const authStatusTextEl = document.querySelector(".auth-popup-text");
    let previouslyFocusedElement = null;
    let pendingAuthFlow = null; // 'login' | 'signup' | null

    function tryCloseAuthPopupWindow() {
      try {
        const possiblePopup = window.open('', 'quotura-auth');
        if (possiblePopup && !possiblePopup.closed) {
          possiblePopup.close();
        }
      } catch (_) {}
    }


    function setPageInertExceptOverlay(enable) {
      try {
        if (!authOverlay) return;
        const children = Array.from(document.body.children);
        children.forEach((el) => {
          if (el === authOverlay) return;
          if (enable) {
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');
          } else {
            el.removeAttribute('inert');
            el.removeAttribute('aria-hidden');
          }
        });
      } catch (_) {}
    }

    function focusAuthDialog() {
      try {
        if (!authOverlay) return;
        const dialogContainer = authOverlay.querySelector('.auth-popup-container');
        if (dialogContainer) {
          if (!dialogContainer.hasAttribute('tabindex')) {
            dialogContainer.setAttribute('tabindex', '-1');
          }
          dialogContainer.focus();
          return;
        }
        // Fallback to first visible, enabled focusable element
        const candidates = authOverlay.querySelectorAll('#authPopupCloseBtn, button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
          const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true';
          const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
          if (!isHidden && !isDisabled && rect.width > 0 && rect.height > 0 && typeof el.focus === 'function') {
            el.focus();
            return;
          }
        }
      } catch (_) {}
    }

    function showAuthOverlay(message) {
      try {
        if (authStatusTextEl && message) authStatusTextEl.textContent = message;
        if (authOverlay) {
          previouslyFocusedElement = document.activeElement;
          authOverlay.classList.add('active');
          authOverlay.setAttribute('aria-hidden', 'false');
          // First move focus into the dialog to avoid hiding a focused element
          focusAuthDialog();
          // Now hide the rest of the page from AT and interaction
          setPageInertExceptOverlay(true);
        }
      } catch (_) {}
    }

    function hideAuthOverlay() {
      try {
        // Move focus OUT of the overlay BEFORE setting aria-hidden to avoid AOM blocking
        if (
          previouslyFocusedElement &&
          document.contains(previouslyFocusedElement) &&
          typeof previouslyFocusedElement.focus === 'function'
        ) {
          previouslyFocusedElement.focus();
        } else {
          // Fallback to a safe focus target not inside the overlay
          const fallbackTargets = [loginBtn, signupBtn, logoutBtn, document.getElementById('message')];
          let focused = false;
          for (const target of fallbackTargets) {
            if (!focused && target && typeof target.focus === 'function' && (!authOverlay || !authOverlay.contains(target))) {
              try { target.focus(); focused = true; } catch (_) {}
            }
          }
          if (!focused) {
            try {
              // Temporarily make body focusable for a safe blur target
              const hadTabindex = document.body.hasAttribute('tabindex');
              if (!hadTabindex) document.body.setAttribute('tabindex', '-1');
              document.body.focus();
              if (!hadTabindex) document.body.removeAttribute('tabindex');
            } catch (_) {}
          }
        }

        if (authOverlay) {
          authOverlay.classList.remove('active');
          // Only now hide from assistive tech
          authOverlay.setAttribute('aria-hidden', 'true');
          setPageInertExceptOverlay(false);
        }
        previouslyFocusedElement = null;
      } catch (_) {}
    }

    if (authCloseBtn) {
      authCloseBtn.addEventListener('click', () => hideAuthOverlay());
    }
    if (authOpenExternalBtn) {
      authOpenExternalBtn.addEventListener('click', () => startCognitoAuthFlow('login'));
    }

    function getIdentityRedirectUri() {
      try {
        if (isChromeAvailable() && chrome.runtime && chrome.runtime.id) {
          return `https://${chrome.runtime.id}.chromiumapp.org/`;
        }
      } catch (_) {}
      return COGNITO_CONFIG.redirectUri;
    }

    function startCognitoAuthFlow(action) {
      const useAction = action === 'signup' ? 'signup' : 'login';
      pendingAuthFlow = useAction;
      const identityRedirectUri = getIdentityRedirectUri();
      const authUrlForIdentity = buildCognitoAuthUrl(useAction, COGNITO_CONFIG, identityRedirectUri);
      const fallbackAuthUrl = buildCognitoAuthUrl(useAction, COGNITO_CONFIG);

      // Optional: brief status overlay while the popup opens
      showAuthOverlay('Opening secure sign-in?');

      // Open a placeholder popup synchronously to avoid popup blockers
      let popupRef = null;
      try {
        const w = 520, h = 680;
        const left = Math.max(0, (window.screen.width - w) / 2);
        const top = Math.max(0, (window.screen.height - h) / 2);
        popupRef = window.open('about:blank', 'quotura-auth', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
      } catch (_) {
        // If blocked, fallback to full-page redirect as last resort
      }

      // If Chrome Identity API is available, prefer it (it will auto-close)
      if (isChromeAvailable() && chrome.identity && chrome.identity.launchWebAuthFlow) {
        try {
          chrome.identity.launchWebAuthFlow({ url: authUrlForIdentity, interactive: true }, async (responseUrl) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              // Identity failed; use our already-open popup
              try {
                if (popupRef && !popupRef.closed) {
                  popupRef.location = fallbackAuthUrl;
                } else {
                  // If popup was blocked/closed, navigate current page as a last resort
                  window.open(fallbackAuthUrl, 'quotura-auth');
                }
              } catch (_) {
                window.location.href = fallbackAuthUrl;
              }
              if (authStatusTextEl) authStatusTextEl.textContent = 'Please complete sign-in in the popup window?';
              try { chrome.storage.local.set({ pendingAuthFlow: pendingAuthFlow, pendingAuthVisible: true }); } catch (_) {}
              // Reveal manual open button in case popup was blocked or needs user action
              try { if (authOpenExternalBtn) authOpenExternalBtn.style.display = 'inline-block'; } catch (_) {}
              return;
            }
            if (typeof responseUrl === 'string' && responseUrl.includes('?')) {
              try {
                const parsed = new URL(responseUrl);
                const code = parsed.searchParams.get('code');
                if (code) {
                  // Best-effort: exchange code to get ID token and user's name
                  try {
                    const name = await exchangeAuthCodeForTokens(code, identityRedirectUri);
                    if (name && name.trim().length > 0) storeUserName(name);
                  } catch (_) {}
                  setSignedIn(true, code);
                  updateAuthUI(true);
                  applyGreetingIfAvailable(true);
                  hideAuthOverlay();
                  showNotification('Signed in successfully!', 'success');
                  // Close placeholder popup if we opened one
                  try { if (popupRef && !popupRef.closed) popupRef.close(); } catch (_) {}
                  // Also try to close any named popup if browsers reused it
                  tryCloseAuthPopupWindow();
                  try { chrome.storage.local.remove(['pendingAuthFlow', 'pendingAuthVisible']); } catch (_) {}
                  return;
                }
              } catch (_) {}
            }
            if (authStatusTextEl) authStatusTextEl.textContent = 'Sign-in was cancelled or did not complete.';
            // Close placeholder if nothing happened
            try { if (popupRef && !popupRef.closed) popupRef.close(); } catch (_) {}
          });
          return;
        } catch (_) {
          // Fall back to manual popup if identity throws synchronously
        }
      }

      // Identity API not available; navigate our already-open popup immediately
      try {
        if (popupRef && !popupRef.closed) {
          popupRef.location = fallbackAuthUrl;
        } else {
          window.open(fallbackAuthUrl, 'quotura-auth');
        }
      } catch (_) {
        window.location.href = fallbackAuthUrl;
      }
      if (authStatusTextEl) authStatusTextEl.textContent = 'Please complete sign-in in the popup window?';
      try { chrome.storage.local.set({ pendingAuthFlow: pendingAuthFlow, pendingAuthVisible: true }); } catch (_) {}
    }

    startAuthFlowForUpgrade = startCognitoAuthFlow;

    function getLogoutUrl() {
      return buildCognitoLogoutUrl(COGNITO_CONFIG);
    }

    function setSignedIn(isSignedIn, codeValue) {
      const payload = { cognitoSignedIn: !!isSignedIn };
      if (codeValue) payload.cognitoAuthCode = codeValue;
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.set(payload);
        } else {
          Object.keys(payload).forEach((k) => localStorage.setItem(k, String(payload[k])));
        }
      } catch (_) {}
    }

    function getSignedIn(callback) {
      try {
        if (isChromeAvailable()) {
          chrome.storage.local.get(["cognitoSignedIn"], (data) => callback(!!(data && data.cognitoSignedIn)));
        } else {
          const v = localStorage.getItem("cognitoSignedIn");
          callback(v === "true");
        }
      } catch (_) {
        callback(false);
      }
    }

    function updateAuthUI(signedIn) {
      if (!authStatus || !loginBtn || !signupBtn || !logoutBtn) return;
      if (signedIn) {
        // Hide auth status when signed in; greeting above image indicates state
        authStatus.textContent = "";
        try { authStatus.style.display = 'none'; } catch (_) {}
        loginBtn.style.display = "none";
        signupBtn.style.display = "none";
        logoutBtn.style.display = "inline-block";
        if (resumeAuthBtn) resumeAuthBtn.style.display = 'none';
        // Fetch and display user tier after sign-in
        fetchUserTierAndStore()
          .then((res) => { applyGreetingIfAvailable(true); applyPlanGating(res && res.tier ? res.tier : 'free'); })
          .catch(() => { applyGreetingIfAvailable(true); applyPlanGatingFromStorage(); });
      } else {
        // Show explicit status when signed out
        authStatus.textContent = "You are not signed in.";
        try { authStatus.style.display = 'block'; } catch (_) {}
        loginBtn.style.display = "inline-block";
        signupBtn.style.display = "inline-block";
        logoutBtn.style.display = "none";
        if (userGreeting) userGreeting.textContent = '';
        applyPlanGating('free');
        if (resumeAuthBtn) {
          try {
            chrome.storage.local.get(['pendingAuthFlow', 'pendingAuthVisible'], (data) => {
              const shouldShow = !!(data && data.pendingAuthFlow && data.pendingAuthVisible);
              resumeAuthBtn.style.display = shouldShow ? 'inline-block' : 'none';
              resumeAuthBtn.textContent = data && data.pendingAuthFlow === 'signup' ? '?? Resume sign-up' : '?? Resume sign-in';
            });
          } catch (_) {}
        }
      }
    }

    // Wire up buttons
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        startCognitoAuthFlow('login');
      });
    }
    if (signupBtn) {
      signupBtn.addEventListener("click", () => {
        startCognitoAuthFlow('signup');
      });
    }
    if (resumeAuthBtn) {
      resumeAuthBtn.addEventListener('click', () => {
        if (isChromeAvailable()) {
          chrome.storage.local.get(['pendingAuthFlow'], (data) => {
            const flow = (data && data.pendingAuthFlow) || 'login';
            startCognitoAuthFlow(flow);
          });
        } else {
          startCognitoAuthFlow('login');
        }
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        setSignedIn(false);
        updateAuthUI(false);
        // Redirect through Cognito logout to clear session
        window.location.href = getLogoutUrl();
      });
    }

    // Determine current state from URL (?code=...)
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get("code");
    if (authCode) {
      // Attempt to exchange the code for ID token to get user's name (best-effort)
      exchangeAuthCodeForTokens(authCode, COGNITO_CONFIG.redirectUri).finally(() => {
        setSignedIn(true, authCode);
        updateAuthUI(true);
        // Also fetch the user tier immediately
        fetchUserTierAndStore()
          .then((res) => { applyGreetingIfAvailable(true); applyPlanGating(res && res.tier ? res.tier : 'free'); })
          .catch(() => { applyGreetingIfAvailable(true); applyPlanGatingFromStorage(); });
        // Clean the URL to remove the code param for aesthetics
        try {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {}
        // If this page is opened as an auth popup, close it and return focus
        try {
          const closeSelf = () => { try { window.close(); } catch (_) {} };
          if (window.opener && !window.opener.closed) {
            // Give storage listeners a moment to fire
            setTimeout(() => {
              try { window.opener.focus(); } catch (_) {}
              closeSelf();
            }, 100);
          } else {
            // No opener reference (e.g., stripped by browser); attempt to close anyway
            setTimeout(closeSelf, 100);
          }
        } catch (_) {}
      });
      return;
    }

    // Listen for sign-in state changes (e.g., from popup flow)
    try {
      if (isChromeAvailable() && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local' && changes && Object.prototype.hasOwnProperty.call(changes, 'cognitoSignedIn')) {
            const newVal = !!(changes.cognitoSignedIn && changes.cognitoSignedIn.newValue);
            updateAuthUI(newVal);
            applyGreetingIfAvailable(newVal);
            if (newVal) {
              hideAuthOverlay();
              tryCloseAuthPopupWindow();
              try { chrome.storage.local.remove(['pendingAuthFlow', 'pendingAuthVisible']); } catch (_) {}
            }
          }
          if (areaName === 'local' && changes && Object.prototype.hasOwnProperty.call(changes, 'userTier')) {
            const newTier = (changes.userTier && changes.userTier.newValue) || 'free';
            applyPlanGating(newTier);
          }
        });
      }
    } catch (_) {}

    // Otherwise, restore last-known state and pending overlay if any
    getSignedIn((signedIn) => {
      updateAuthUI(signedIn);
      if (signedIn) {
        // Ensure tier is loaded if returning user
        fetchUserTierAndStore()
          .then((res) => { applyGreetingIfAvailable(true); applyPlanGating(res && res.tier ? res.tier : 'free'); })
          .catch(() => { applyGreetingIfAvailable(true); applyPlanGatingFromStorage(); });
      } else {
        applyGreetingIfAvailable(false);
        applyPlanGating('free');
      }
      if (!signedIn) {
        try {
          chrome.storage.local.get(['pendingAuthFlow', 'pendingAuthVisible'], (data) => {
            if (data && data.pendingAuthFlow && data.pendingAuthVisible) {
              const text = data.pendingAuthFlow === 'signup' ? 'Please complete sign-up in the popup?' : 'Please complete sign-in in the popup?';
              showAuthOverlay(text);
              if (resumeAuthBtn) {
                resumeAuthBtn.style.display = 'inline-block';
                resumeAuthBtn.textContent = data.pendingAuthFlow === 'signup' ? '?? Resume sign-up' : '?? Resume sign-in';
              }
            }
          });
        } catch (_) {}
      }
    });
  }
  
  /**
   * Initialize the preview page by loading the generated image
   */
  function initializePreview() {
    if (!isChromeAvailable()) {
      msg.textContent = "Open via the extension to generate the image.";
      // Keep rest of UI interactive
      return;
    }
    // Reset state variables
    currentImageData = null;
    watermarkRemoved = false;
    
    // Clear any previous image to avoid showing stale data
    img.src = "";
    msg.textContent = "Generating your beautiful quote...";
    disableExportButtons();
    
    // Wait for the background script to generate the new image
    let retryCount = 0;
    const maxRetries = 100; // Maximum 10 seconds of waiting
    
    const checkForImage = () => {
      chrome.storage.local.get("quoteImage", (data) => {
        if (data.quoteImage) {
          // Image found - display it and update status message
          currentImageData = data.quoteImage;
          img.src = data.quoteImage;                    // Set image source to data URL
          msg.textContent = "Your beautified quote is ready!";
          // Prime current text for editing
          chrome.storage.local.get(["quoteText"], (t) => {
            if (t && t.quoteText) currentText = t.quoteText;
          });
          
          // Enable export buttons
          enableExportButtons();
        } else {
          // No image found yet - retry after a short delay
          retryCount++;
          if (retryCount < maxRetries) {
            setTimeout(checkForImage, 100);
          } else {
            // Timeout - show error message
            msg.textContent = "Failed to generate image. Please try again.";
            msg.style.color = "#dc3545";
          }
        }
      });
    };
    
    // Start checking for the image
    checkForImage();
  }
  
  /**
   * Enable all export buttons
   */
  function enableExportButtons() {
    downloadPngBtn.disabled = false;
    downloadSvgBtn.disabled = false;
    copyImageBtn.disabled = false;
    // Only Pro users can click Remove Watermark and only until it's removed
    removeWatermarkBtn.disabled = (!userIsPro) || watermarkRemoved;
    if (watermarkRemoved) {
      removeWatermarkBtn.textContent = "Watermark Removed";
      removeWatermarkBtn.classList.remove("btn-warning");
      removeWatermarkBtn.classList.add("btn-success");
    }
  }
  
  /**
   * Disable all export buttons
   */
  function disableExportButtons() {
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    copyImageBtn.disabled = true;
    removeWatermarkBtn.disabled = true;
  }
  
  /**
   * Set button loading state
   * @param {HTMLElement} button - The button element
   * @param {boolean} loading - Whether button is in loading state
   */
  function setButtonLoading(button, loading) {
    if (loading) {
      button.classList.add("btn-loading");
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = "? Loading...";
    } else {
      button.classList.remove("btn-loading");
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    }
  }
  
  /**
   * Download PNG image
   */
  function downloadPNG() {
    if (!currentImageData || !isChromeAvailable()) return;
    
    setButtonLoading(downloadPngBtn, true);
    
    // Use current image data for download
    chrome.downloads.download({
      url: currentImageData,      // Data URL containing the image
      filename: "quotura-quote.png",     // Filename for the download
    }, () => {
      setButtonLoading(downloadPngBtn, false);
      showNotification("PNG downloaded successfully!", "success");
    });
  }
  
  /**
   * Download SVG image
   */
  function downloadSVG() {
    if (!isChromeAvailable()) return;
    setButtonLoading(downloadSvgBtn, true);

    // Request SVG generation from background script
    chrome.runtime.sendMessage({
      action: "generateSVG",
      includeWatermark: !watermarkRemoved,  // Include watermark unless removed
      font: currentFont,
      fontSize: currentFontSize,
    }, (response) => {
      setButtonLoading(downloadSvgBtn, false);

      if (response && response.svgData) {
        // Download the SVG file
        chrome.downloads.download({
          url: response.svgData,
          filename: "quotura-quote.svg",
        }, () => {
          showNotification("SVG downloaded successfully!", "success");
        });
      } else {
        showNotification("Failed to generate SVG", "error");
      }
    });
  }
  
  /**
   * Copy image to clipboard
   */
  async function copyToClipboard() {
    if (!currentImageData) return;
    
    setButtonLoading(copyImageBtn, true);
    
    try {
      // Convert data URL to blob
      const response = await fetch(currentImageData);
      const blob = await response.blob();
      
      // Copy to clipboard using Clipboard API
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      
      setButtonLoading(copyImageBtn, false);
      showNotification("Image copied to clipboard!", "success");
      
      // Temporarily change button text to show success
      const originalText = copyImageBtn.textContent;
      copyImageBtn.textContent = "? Copied!";
      
      setTimeout(() => {
        copyImageBtn.textContent = originalText;
      }, 2000);
      
    } catch (error) {
      setButtonLoading(copyImageBtn, false);
      showNotification("Failed to copy to clipboard. Your browser may not support this feature.", "error");
      console.error("Clipboard copy failed:", error);
    }
  }
  
  /**
   * Remove watermark from image
   */
  function removeWatermark() {
    // Safety guard: never allow non-Pro users to remove watermark
    if (!userIsPro) { showUpgradeOverlay('Removing watermark is a Pro feature.'); return; }
    if (watermarkRemoved || !isChromeAvailable()) return;
    
    setButtonLoading(removeWatermarkBtn, true);
    
    // Use current font and size settings when removing watermark
    chrome.storage.local.get(["quoteText", "quoteTextHtml"], (data) => {
      if (data.quoteText) {
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: data.quoteText,
          html: (typeof data.quoteTextHtml === 'string' && data.quoteTextHtml.length > 0) ? data.quoteTextHtml : null,
          font: currentFont,
          fontSize: currentFontSize,
          includeWatermark: false
        }, (response) => {
          setButtonLoading(removeWatermarkBtn, false);
          
          if (response && response.imageData) {
            // Update current image with watermark-free version
            currentImageData = response.imageData;
            img.src = response.imageData;
            watermarkRemoved = true;
            
            // Update UI to reflect watermark removal
            removeWatermarkBtn.textContent = "Watermark Removed";
            removeWatermarkBtn.disabled = true;
            removeWatermarkBtn.classList.remove("btn-warning");
            removeWatermarkBtn.classList.add("btn-success");
            
            showNotification("Watermark removed successfully!", "success");
          } else {
            showNotification("Failed to remove watermark", "error");
          }
        });
      }
    });
  }
  
  /**
   * Show notification message
   * @param {string} message - The notification message
   * @param {string} type - The notification type (success, error, info)
   */
  function showNotification(message, type = "info") {
    // Update the main message element temporarily
    const originalMessage = msg.textContent;
    const originalColor = msg.style.color;
    
    msg.textContent = message;
    
    // Set color based on type
    switch (type) {
      case "success":
        msg.style.color = "#28a745";
        break;
      case "error":
        msg.style.color = "#dc3545";
        break;
      default:
        msg.style.color = "#333";
    }
    
    // Restore original message after 3 seconds
    setTimeout(() => {
      msg.textContent = originalMessage;
      msg.style.color = originalColor;
    }, 3000);
  }
  
    /**
     * Handle Remove Watermark button click
     */
    function handleRemoveWatermarkClick() {
      if (!userIsPro) {
        showUpgradeOverlay('Removing watermark is a Pro feature.');
        return;
      }
      removeWatermark();
    }
  
  /**
   * Handle Quick Edit button click - shows edit panel
   */
  function handleQuickEdit() {
    // Ensure right panel is visible
    if (!editMode) {
      editMode = true;
      editPanel.classList.add("active");
      if (quickEditBtn) quickEditBtn.style.opacity = "0.7";
    }
    // For non-Pro (including signed-out), keep image visible and panel locked without opening editor
    if (!userIsPro) {
      hideEditingVisuals();
      return;
    }
    // Pro users: open the inline editor on first click; focus if already open
    if (!inlineEditing) {
      openInlineEditor();
    } else {
      try { inlineEditor.focus(); } catch (_) {}
    }
  }

  /**
   * Open inline editor overlay for editing quote content with live preview
   */
  // Removed explicit Edit Text button; clicking the image opens editor

  // Simple HTML escape for initial textarea content
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Debounced regenerate to keep typing responsive
  function debounceRegenerateWithNewText() {
    if (regenerateDebounceId) clearTimeout(regenerateDebounceId);
    regenerateDebounceId = setTimeout(() => {
      regenerateWithSettingsUsingText(currentText || "");
    }, 250);
  }

  // Regenerate using explicit text value instead of fetching from storage
  function regenerateWithSettingsUsingText(textValue) {
    if (!isChromeAvailable()) {
      msg.textContent = "Settings updated (preview only)";
      return;
    }
    msg.textContent = "Updating with new settings...";
    disableExportButtons();
    chrome.runtime.sendMessage({
      action: "regenerateWithSettings",
      text: textValue,
      html: (typeof currentTextHtml === 'string' && currentTextHtml.length > 0) ? currentTextHtml : null,
      font: currentFont,
      fontSize: currentFontSize,
      includeWatermark: !watermarkRemoved,
      gradient: currentGradientChoice
    }, (response) => {
      if (response && response.imageData) {
        currentImageData = response.imageData;
        img.src = response.imageData;
        msg.textContent = "Settings updated successfully!";
        enableExportButtons();
      } else {
        msg.textContent = "Failed to update settings";
        showNotification("Failed to update settings", "error");
      }
    });
  }
  
  /**
   * Inline editor helpers
   */
  function getBrightness(hex) {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  function syncInlineEditorStyles() {
    inlineEditor.style.fontFamily = currentFont;
    inlineEditor.style.fontSize = `${currentFontSize}px`;
    // Default to white; adjust based on stored gradient for parity with canvas
    inlineEditor.style.color = '#ffffff';
    if (isChromeAvailable()) {
      chrome.storage.local.get(["currentGradient"], (data) => {
        try {
          const grad = data && data.currentGradient;
          if (grad && grad[0]) {
            const brightness = getBrightness(grad[0]);
            inlineEditor.style.color = brightness > 200 ? '#000000' : '#ffffff';
          }
        } catch (e) {}
      });
    }
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function ensureInlineEditorOpen() {
    if (!inlineEditing) {
      openInlineEditor();
    }
  }

  function toggleCommand(command) {
    try {
      if (!userIsPro) { showUpgradeOverlay('Text formatting is a Pro feature.'); return; }
      ensureInlineEditorOpen();
      // Use deprecated execCommand for simplicity; widely supported for contentEditable
      document.execCommand(command, false, null);
      // Persist content and refresh image
      const newText = (inlineEditor.innerText || '').replace(/\r\n/g, '\n');
      const newHtml = inlineEditor.innerHTML || '';
      currentText = newText;
      currentTextHtml = newHtml;
      if (isChromeAvailable()) chrome.storage.local.set({ quoteText: newText, quoteTextHtml: newHtml });
      debounceRegenerateWithNewText();
      updateActiveFormatButtons();
      inlineEditor.focus();
    } catch (_) {}
  }

  function updateActiveFormatButtons() {
    try {
      if (!inlineEditor) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      // Query commands state
      const isBold = document.queryCommandState && document.queryCommandState('bold');
      const isItalic = document.queryCommandState && document.queryCommandState('italic');
      const isUnderline = document.queryCommandState && document.queryCommandState('underline');
      if (boldBtn) boldBtn.classList.toggle('active', !!isBold);
      if (italicBtn) italicBtn.classList.toggle('active', !!isItalic);
      if (underlineBtn) underlineBtn.classList.toggle('active', !!isUnderline);
    } catch (_) {}
  }

  function openInlineEditor() {
    if (isChromeAvailable()) {
      chrome.storage.local.get(["quoteText", "quoteTextHtml"], (data) => {
        // Prefer the in-memory text/html from the current image, fallback to storage
        const preferredHtml = (typeof currentTextHtml === 'string' && currentTextHtml.length > 0)
          ? currentTextHtml
          : (data && typeof data.quoteTextHtml === 'string' && data.quoteTextHtml.length > 0
              ? data.quoteTextHtml
              : null);

        const preferredText = (typeof currentText === 'string')
          ? currentText
          : ((data && data.quoteText) || "");

        if (preferredHtml) {
          inlineEditor.innerHTML = preferredHtml;
          currentTextHtml = preferredHtml;
        } else {
          inlineEditor.textContent = preferredText;
          currentTextHtml = null;
        }
        currentText = preferredText;
        syncInlineEditorStyles();
        inlineEditing = true;
        inlineEditor.classList.add('active');
        // Apply content editability based on plan
        if (userIsPro) {
          inlineEditor.setAttribute('contenteditable', 'true');
          placeCaretAtEnd(inlineEditor);
          inlineEditor.focus();
        } else {
          inlineEditor.setAttribute('contenteditable', 'false');
          inlineEditor.style.cursor = 'not-allowed';
        }
        showEditingVisuals();
        setTimeout(updateActiveFormatButtons, 0);
      });
    } else {
      const preferredText = (typeof currentText === 'string') ? currentText : "";
      if (currentTextHtml && typeof currentTextHtml === 'string' && currentTextHtml.length > 0) {
        inlineEditor.innerHTML = currentTextHtml;
      } else {
        inlineEditor.textContent = preferredText;
      }
      currentText = preferredText;
      syncInlineEditorStyles();
      inlineEditing = true;
      inlineEditor.classList.add('active');
      if (userIsPro) {
        inlineEditor.setAttribute('contenteditable', 'true');
        placeCaretAtEnd(inlineEditor);
        inlineEditor.focus();
      } else {
        inlineEditor.setAttribute('contenteditable', 'false');
        inlineEditor.style.cursor = 'not-allowed';
      }
      showEditingVisuals();
      setTimeout(updateActiveFormatButtons, 0);
    }
  }

  function closeInlineEditor() {
    inlineEditing = false;
    inlineEditor.classList.remove('active');
    inlineEditor.blur();
    // no separate inline done UI anymore
    hideEditingVisuals();
  }
  
  /**
   * Handle font selection - creates beautiful font picker modal
   */
  function handleFontChange() {
    // Create font picker modal
    const modal = createFontPickerModal();
    document.body.appendChild(modal);
    
    // Animate in
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }
  
  /**
   * Create beautiful font picker modal
   */
    function createFontPickerModal() {
      const fonts = [
        { name: "Arial", display: "Arial", description: "Clean & Professional", sample: "The quick brown fox jumps" },
        { name: "Georgia", display: "Georgia", description: "Elegant Serif", sample: "The quick brown fox jumps" },
        { name: "Helvetica", display: "Helvetica", description: "Modern Classic", sample: "The quick brown fox jumps" },
        { name: "Times New Roman", display: "Times", description: "Traditional Serif", sample: "The quick brown fox jumps" },
        { name: "Verdana", display: "Verdana", description: "Clear & Readable", sample: "The quick brown fox jumps" }
      ];

      const modal = document.createElement('div');
      modal.className = 'font-picker-modal';
      modal.innerHTML = `
        <div class="font-picker-backdrop"></div>
        <div class="font-picker-container">
          <div class="font-picker-header">
            <h3>Choose Font Style</h3>
            <button class="close-btn" aria-label="Close">X</button>
          </div>
          <div class="font-options">
            ${fonts.map((font, index) => `
              <div class="font-option ${font.name === currentFont ? 'selected' : ''}" data-font="${font.name}">
                <div class="font-info">
                  <div class="font-name" style="font-family: ${font.name}">${font.display}</div>
                  <div class="font-desc">${font.description}</div>
                </div>
                <div class="font-sample" style="font-family: ${font.name}">${font.sample}</div>
                <div class="select-indicator">?</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-btn');
    const backdrop = modal.querySelector('.font-picker-backdrop');
    const options = modal.querySelectorAll('.font-option');
    
    closeBtn.addEventListener('click', () => closeFontPicker(modal));
    backdrop.addEventListener('click', () => closeFontPicker(modal));
    
    options.forEach(option => {
      option.addEventListener('click', () => {
        const fontName = option.dataset.font;
        selectFont(fontName, modal);
      });
    });
    
    return modal;
  }
  
  /**
   * Select font and update image
   */
  function selectFont(fontName, modal) {
    if (fontName !== currentFont) {
      currentFont = fontName;
      persistFontSettings(currentFont, currentFontSize);
      regenerateWithSettings();
      showNotification(`Font changed to ${fontName}!`, "success");
      if (inlineEditing) syncInlineEditorStyles();
    }
    closeFontPicker(modal);
  }
  
  /**
   * Close font picker with animation
   */
  function closeFontPicker(modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      if (modal && modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  }
  
  /**
   * Handle background selection - opens gradient picker modal
   */
  function handleBackgroundChange() {
    const modal = createGradientPickerModal();
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }
  
  /**
   * Create gradient picker modal from predefined gradients in background.js
   */
  function createGradientPickerModal() {
    const gradients = [
      { name: "Blue", colors: ["#4facfe", "#00f2fe"] },
      { name: "Green Teal", colors: ["#43e97b", "#38f9d7"] },
      { name: "Pink Yellow", colors: ["#fa709a", "#fee140"] },
      { name: "Teal Purple", colors: ["#30cfd0", "#330867"] },
      { name: "Soft Pink", colors: ["#ff9a9e", "#fad0c4"] },
      { name: "Sky Blue", colors: ["#a1c4fd", "#c2e9fb"] },
      { name: "Violet", colors: ["#667eea", "#764ba2"] },
      { name: "Pastel", colors: ["#fddb92", "#d1fdff"] },
    ];
    
      const modal = document.createElement('div');
      modal.className = 'gradient-picker-modal';

      const optionsHTML = [
        `<div class="gradient-option upload-option" data-upload="true">
          <div class="gradient-swatch" style="display:flex;align-items:center;justify-content:center;background: linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.15)); color:#333; font-weight:700;">
            Upload from device
          </div>
          <div class="gradient-name">Custom image</div>
        </div>`,
        `<div class="gradient-option random-option" data-colors="random">
          <div class="gradient-swatch" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">RANDOM</div>
          <div class="gradient-name">Random</div>
        </div>`,
        ...gradients.map(g => `
          <div class="gradient-option" data-colors='${JSON.stringify(g.colors)}'>
            <div class="gradient-swatch" style="background: linear-gradient(135deg, ${g.colors[0]} 0%, ${g.colors[1]} 100%)"></div>
            <div class="gradient-name">${g.name}</div>
          </div>
        `)
      ].join('');

      modal.innerHTML = `
        <div class="gradient-picker-backdrop"></div>
        <div class="gradient-picker-container">
          <div class="gradient-picker-header">
            <h3>Choose Background</h3>
            <button class="close-btn" aria-label="Close">X</button>
          </div>
          <div class="gradient-grid">
            ${optionsHTML}
          </div>
        </div>
      `;
    
    const closeBtn = modal.querySelector('.close-btn');
    const backdrop = modal.querySelector('.gradient-picker-backdrop');
    const options = modal.querySelectorAll('.gradient-option');
    // Hidden file input for upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    modal.appendChild(fileInput);
    
    const close = () => closeGradientPicker(modal);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        currentGradientChoice = null;
        if (isChromeAvailable()) {
          chrome.storage.local.set({ customBackgroundImage: dataUrl }, () => {
            // Clear any stored gradient to favor the image background
            chrome.storage.local.remove('currentGradient', () => {
              regenerateWithSettings();
              showNotification('Background image updated!', 'success');
              setTimeout(() => updateEditBackgroundGradient(), 0);
            });
          });
        }
        close();
      };
      reader.readAsDataURL(file);
    });

    options.forEach(option => {
      option.addEventListener('click', () => {
        if (option.getAttribute('data-upload') === 'true') {
          // Trigger file picker
          fileInput.click();
          return;
        }
        const data = option.getAttribute('data-colors');
        if (data === 'random') {
          currentGradientChoice = null;
          if (isChromeAvailable()) {
            // Remove custom image and gradient to enable random
            chrome.storage.local.remove(['customBackgroundImage', 'currentGradient'], () => {
              regenerateWithSettings();
              showNotification('Background set to random', 'success');
              setTimeout(() => {
                updateEditBackgroundGradient();
                if (inlineEditing) syncInlineEditorStyles();
              }, 0);
            });
          } else {
            regenerateWithSettings();
          }
        } else {
          try {
            const colors = JSON.parse(data);
            currentGradientChoice = colors;
            if (isChromeAvailable()) {
              // Persist gradient and clear any custom image
              chrome.storage.local.set({ currentGradient: colors }, () => {
                chrome.storage.local.remove('customBackgroundImage', () => {
                  regenerateWithSettings();
                  showNotification('Background updated!', 'success');
                  setTimeout(() => {
                    updateEditBackgroundGradient();
                    if (inlineEditing) syncInlineEditorStyles();
                  }, 0);
                });
              });
            } else {
              regenerateWithSettings();
            }
          } catch (_) {}
        }
        close();
      });
    });
    
    return modal;
  }
  
  function closeGradientPicker(modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      if (modal && modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  }
  
  /**
   * Handle font size increase/decrease
   */
  function handleSizeChange(delta) {
    const newSize = currentFontSize + delta;
    
    // Constrain size between 12px and 60px
      if (newSize >= 12 && newSize <= 60) {
        currentFontSize = newSize;

        // Update display with animation
        currentSizeDisplay.classList.add("updating");
        currentSizeDisplay.textContent = currentFontSize;

        setTimeout(() => {
          currentSizeDisplay.classList.remove("updating");
        }, 300);

        // Update inline editor style if open
        if (inlineEditing) syncInlineEditorStyles();

        // Regenerate image with new size
        regenerateWithSettings();

        // Show subtle notification
        const action = delta > 0 ? "increased" : "decreased";
        showNotification(`Font size ${action} to ${currentFontSize}px!`, "success");
        persistFontSettings(currentFont, currentFontSize);
      } else {
        // Show size limit notification
        const limit = newSize < 12 ? "minimum" : "maximum";
        const limitValue = newSize < 12 ? "12px" : "60px";
        showNotification(`${limit} font size is ${limitValue}`, "error");

        // Brief shake animation for feedback
        currentSizeDisplay.style.animation = "shake 0.3s ease-in-out";
        setTimeout(() => {
          currentSizeDisplay.style.animation = "";
        }, 300);
      }
  }
  
  /**
   * Regenerate image with current font and size settings
   */
  function regenerateWithSettings() {
    if (!isChromeAvailable()) {
      msg.textContent = "Settings updated (preview only)";
      return;
    }
    chrome.storage.local.get(["quoteText", "quoteTextHtml"], (data) => {
      if (data.quoteText) {
        msg.textContent = "Updating with new settings...";
        disableExportButtons();
        
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: data.quoteText,
          html: (typeof data.quoteTextHtml === 'string' && data.quoteTextHtml.length > 0) ? data.quoteTextHtml : null,
          font: currentFont,
          fontSize: currentFontSize,
          includeWatermark: !watermarkRemoved,
          gradient: currentGradientChoice // Pass the current gradient choice
        }, (response) => {
          if (response && response.imageData) {
            currentImageData = response.imageData;
            img.src = response.imageData;
            msg.textContent = "Settings updated successfully!";
            enableExportButtons();
          } else {
            msg.textContent = "Failed to update settings";
            showNotification("Failed to update settings", "error");
          }
        });
      }
    });
  }
  
  /**
   * Handle Done button click - hides edit panel
   */
  function handleDone() {
    // If inline editor is open, persist the latest text (including newlines)
    // and trigger a final regenerate before closing the editor
    if (inlineEditing && inlineEditor) {
      const finalText = (inlineEditor.innerText || "").replace(/\r\n/g, '\n');
      const finalHtml = inlineEditor.innerHTML || '';
      currentText = finalText;
      currentTextHtml = finalHtml;
      if (isChromeAvailable()) chrome.storage.local.set({ quoteText: finalText, quoteTextHtml: finalHtml });
      regenerateWithSettingsUsingText(finalText);
    }

    if (editMode) {
      // Exit edit mode with animation
      editPanel.classList.add("exiting");
      editPanel.classList.remove("active");
      
      setTimeout(() => {
        editPanel.classList.remove("exiting");
        editMode = false;
        if (quickEditBtn) quickEditBtn.style.opacity = "1";
      }, 400);
    }
    // Also close inline editor if open
    if (inlineEditing) {
      closeInlineEditor();
    }
  }
   
    // Event listeners for export buttons
    downloadPngBtn.addEventListener("click", downloadPNG);
    downloadSvgBtn.addEventListener("click", downloadSVG);
    copyImageBtn.addEventListener("click", copyToClipboard);
    removeWatermarkBtn.addEventListener("click", handleRemoveWatermarkClick);
  
  // Event listener for quick edit
  if (quickEditBtn) quickEditBtn.addEventListener("click", handleQuickEdit);
  
  // Event listeners for edit panel
  fontBtn.addEventListener("click", handleFontChange);
  backgroundBtn.addEventListener("click", handleBackgroundChange);
  decreaseSizeBtn.addEventListener("click", () => { if (!userIsPro) return showUpgradeOverlay('Editor is locked. Upgrade to Pro.'); handleSizeChange(-2); });
  increaseSizeBtn.addEventListener("click", () => { if (!userIsPro) return showUpgradeOverlay('Editor is locked. Upgrade to Pro.'); handleSizeChange(2); });
  doneBtn.addEventListener("click", handleDone);
  
  // Open quick edit panel when image is clicked
  img.addEventListener("click", handleQuickEdit);
  
  // Inline editor live update
  inlineEditor.addEventListener('input', () => {
    if (!userIsPro) { showUpgradeOverlay('Editing text is a Pro feature.'); return; }
    const newText = (inlineEditor.innerText || '').replace(/\r\n/g, '\n');
    const newHtml = inlineEditor.innerHTML || '';
    currentText = newText;
    currentTextHtml = newHtml;
    if (isChromeAvailable()) chrome.storage.local.set({ quoteText: newText, quoteTextHtml: newHtml });
    debounceRegenerateWithNewText();
    updateActiveFormatButtons();
  });

  // Close inline editor with Escape
  document.addEventListener('keydown', (e) => {
    if (inlineEditing && e.key === 'Escape') {
      e.preventDefault();
      closeInlineEditor();
    }
  });

  // Update format button states on selection changes within the editor
  document.addEventListener('selectionchange', () => {
    if (!inlineEditing) return;
    if (!inlineEditor) return;
    const sel = window.getSelection();
    if (sel && sel.anchorNode && inlineEditor.contains(sel.anchorNode)) {
      updateActiveFormatButtons();
    }
  });

  // Wire up formatting button events
  if (boldBtn) boldBtn.addEventListener('click', () => toggleCommand('bold'));
  if (italicBtn) italicBtn.addEventListener('click', () => toggleCommand('italic'));
  if (underlineBtn) underlineBtn.addEventListener('click', () => toggleCommand('underline'));
  
  // Upgrade overlay wiring
  const upgradeBtn = document.getElementById('upgradeBtn');
  const upgradeOverlay = document.getElementById('upgradePopupOverlay');
  const upgradeCloseBtn = document.getElementById('upgradePopupCloseBtn');
  const upgradeStartBtn = document.getElementById('upgradeStartBtn');
  const editPanelLock = document.getElementById('editPanelLock');

  function setPageInertExceptUpgrade(enable) {
    try {
      if (!upgradeOverlay) return;
      const children = Array.from(document.body.children);
      children.forEach((el) => {
        if (el === upgradeOverlay) return;
        if (enable) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
        else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      });
    } catch (_) {}
  }

  function focusUpgradeDialog() {
    try {
      if (!upgradeOverlay) return;
      const dialogContainer = upgradeOverlay.querySelector('.auth-popup-container');
      if (dialogContainer) {
        if (!dialogContainer.hasAttribute('tabindex')) dialogContainer.setAttribute('tabindex', '-1');
        dialogContainer.focus();
      }
    } catch (_) {}
  }

  function showUpgradeOverlay(message) {
    try {
      if (!upgradeOverlay) return;
      const textEl = upgradeOverlay.querySelector('.auth-popup-text');
      if (textEl && message) textEl.textContent = message;
      upgradeOverlay.classList.add('active');
      upgradeOverlay.setAttribute('aria-hidden', 'false');
      focusUpgradeDialog();
      setPageInertExceptUpgrade(true);
    } catch (_) {}
  }

  function hideUpgradeOverlay() {
    try {
      if (!upgradeOverlay) return;
      upgradeOverlay.classList.remove('active');
      upgradeOverlay.setAttribute('aria-hidden', 'true');
      setPageInertExceptUpgrade(false);
      try { if (upgradeBtn) upgradeBtn.focus(); } catch (_) {}
    } catch (_) {}
  }

  async function createTempSessionAndOpenUpgrade() {
    try {
      const idToken = await getIdTokenFromStorage();
      if (typeof idToken !== 'string' || idToken.trim().length === 0) {
        showNotification('Login required to upgrade', 'error');
        if (typeof startAuthFlowForUpgrade === 'function') {
          try { startAuthFlowForUpgrade('login'); } catch (_) {}
        }
        return;
      }

      let response;
      try {
        response = await fetch(API_ENDPOINTS.createTempSession, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            Accept: 'application/json',
          },
          credentials: 'omit',
          cache: 'no-store',
        });
      } catch (_) {
        showNotification('Login required to upgrade', 'error');
        return;
      }

      if (!response || !response.ok) {
        showNotification('Login required to upgrade', 'error');
        return;
      }

      let sessionId = null;
      try {
        const payload = await response.json();
        if (payload && typeof payload === 'object') {
          sessionId = payload.sessionId || payload.session || payload.id || payload.sessionID || null;
        }
      } catch (_) {}

      if (!sessionId || typeof sessionId !== 'string') {
        showNotification('Login required to upgrade', 'error');
        return;
      }

      const upgradeUrl = `${UPGRADE_PAGE_URL}?session=${encodeURIComponent(sessionId)}`;
      try {
        window.open(upgradeUrl, '_blank');
      } catch (_) {
        showNotification('Login required to upgrade', 'error');
      }
    } catch (_) {
      showNotification('Login required to upgrade', 'error');
    }
  }

  function handleUpgradeButtonClick(event) {
    try {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    } catch (_) {}
    hideUpgradeOverlay();
    createTempSessionAndOpenUpgrade();
  }

  if (upgradeBtn) upgradeBtn.addEventListener('click', handleUpgradeButtonClick);
  if (upgradeCloseBtn) upgradeCloseBtn.addEventListener('click', hideUpgradeOverlay);
  if (upgradeStartBtn) upgradeStartBtn.addEventListener('click', handleUpgradeButtonClick);
  if (editPanelLock) editPanelLock.addEventListener('click', () => showUpgradeOverlay('The editor is locked. Upgrade to Pro.'));

  // Apply gating immediately on load
  applyPlanGatingFromStorage();
  
  // Interactive blob functionality
  initializeInteractiveBlobs();
})();

/**
 * Initialize gentle physics-like movement for all bubbles and blobs
 */
function initializeInteractiveBlobs() {
  // Get all interactive elements (both bubbles and blobs)
  const bubbles = document.querySelectorAll('.bubble');
  const blobs = document.querySelectorAll('.blob');
  const allElements = [...bubbles, ...blobs];
  
  // Add mouse move listener to the entire document
  document.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    allElements.forEach((element) => {
      // Get element center position
      const rect = element.getBoundingClientRect();
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;
      
      // Calculate distance from cursor to element center
      const deltaX = elementCenterX - mouseX;
      const deltaY = elementCenterY - mouseY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Define influence radius (how close cursor needs to be to affect the element)
      const influenceRadius = 150;
      
             if (distance < influenceRadius && distance > 0) {
         // Calculate movement intensity based on distance (closer = more movement)
         const intensity = (influenceRadius - distance) / influenceRadius;
         
         // Different physics for blobs vs bubbles (blobs are more reactive)
         let pushDistance, scaleIncrease;
         
         if (element.classList.contains('blob')) {
           // Blobs move further and are more sensitive (like they're lighter/more fluid)
           pushDistance = intensity * 60; // Maximum 60px movement for blobs
           scaleIncrease = 1 + (intensity * 0.15); // Maximum 15% scale increase
         } else {
           // Bubbles have gentler movement (like they're heavier/more stable)
           pushDistance = intensity * 30; // Maximum 30px movement for bubbles
           scaleIncrease = 1 + (intensity * 0.1); // Maximum 10% scale increase
         }
         
         // Calculate push direction away from cursor
         const pushX = (deltaX / distance) * pushDistance;
         const pushY = (deltaY / distance) * pushDistance;
         
         // Apply movement with physics-based scaling
         element.style.transform = `translate(${pushX}px, ${pushY}px) scale(${scaleIncrease})`;
        
        // Add slight glow effect when influenced
        if (element.classList.contains('bubble')) {
          element.style.background = `rgba(255, 255, 255, ${0.1 + intensity * 0.1})`;
          element.style.borderColor = `rgba(255, 255, 255, ${0.2 + intensity * 0.2})`;
        } else if (element.classList.contains('blob')) {
          element.style.background = `linear-gradient(45deg, rgba(255, 255, 255, ${0.1 + intensity * 0.1}), rgba(255, 255, 255, ${0.05 + intensity * 0.05}))`;
          element.style.borderColor = `rgba(255, 255, 255, ${0.15 + intensity * 0.15})`;
        }
        
      } else {
        // Return to original state when cursor is far away
        element.style.transform = '';
        
        // Reset appearance
        if (element.classList.contains('bubble')) {
          element.style.background = 'rgba(255, 255, 255, 0.1)';
          element.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        } else if (element.classList.contains('blob')) {
          element.style.background = 'linear-gradient(45deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
          element.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }
    });
  });
  
  // Reset all elements when mouse leaves the window
  document.addEventListener('mouseleave', () => {
    allElements.forEach((element) => {
      element.style.transform = '';
      
      // Reset appearance
      if (element.classList.contains('bubble')) {
        element.style.background = 'rgba(255, 255, 255, 0.1)';
        element.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      } else if (element.classList.contains('blob')) {
        element.style.background = 'linear-gradient(45deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
        element.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      }
    });
  });
}
