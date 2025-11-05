// Extension initialization - runs when extension is installed or enabled
chrome.runtime.onInstalled.addListener(() => {
  // Create right-click context menu item for selected text
  chrome.contextMenus.create({
    id: "beautifyQuote",           // Unique identifier for this menu item
    title: "Beautify this",       // Text displayed in context menu
    contexts: ["selection"],      // Only show when text is selected
  });
});

// Listen for request to fetch user tier (from preview or elsewhere)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'fetchUserTier') {
    try {
      chrome.storage.local.get(['cognitoIdToken'], async (data) => {
        const idToken = data && typeof data.cognitoIdToken === 'string' ? data.cognitoIdToken : null;
        if (!idToken) {
          sendResponse({ ok: false, error: 'missing_token' });
          return;
        }
        const apiUrl = 'https://quotura.imaginetechverse.com/api/user';
        try {
          const resp = await fetch(apiUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
          });
          if (!resp.ok) {
            sendResponse({ ok: false, status: resp.status });
            return;
          }
          const json = await resp.json();
          const tier = json && (json.tier === 'pro' ? 'pro' : 'free');
          const trialStartDate = json && typeof json.trialStartDate === 'string' ? json.trialStartDate : null;
          chrome.storage.local.set({ userTier: tier, userTrialStartDate: trialStartDate || null }, () => {
            sendResponse({ ok: true, tier, trialStartDate });
          });
        } catch (e) {
          sendResponse({ ok: false, error: 'network_error' });
        }
      });
    } catch (e) {
      sendResponse({ ok: false, error: 'unexpected' });
    }
    return true; // Keep channel open for async sendResponse
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  // Check if our menu item was clicked and text is selected
  if (info.menuItemId === "beautifyQuote" && info.selectionText) {
    // Open preview tab immediately as part of user gesture
    chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") }, () => {
      // Generate and store the image after opening tab
      createQuoteImage(info.selectionText);
    });
  }
});

// Handle messages from preview tab for additional functionality
// ===== Pro entitlement verification (server-backed, short-lived cache) =====
const ENTITLEMENT_TTL_MS = 60 * 1000; // 60s cache to reduce API chatter
let lastEntitlementCheckMs = 0;
let lastEntitlementIsPro = false;
const ENT_AWS_REGION = 'us-east-1';

async function verifyProEntitlement() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['cognitoIdToken'], async (data) => {
        const idToken = data && typeof data.cognitoIdToken === 'string' ? data.cognitoIdToken : null;
        if (!idToken) { resolve(false); return; }

        const now = Date.now();
        if (now - lastEntitlementCheckMs < ENTITLEMENT_TTL_MS) {
          resolve(lastEntitlementIsPro);
          return;
        }

        const apiUrl = `https://ffngxtofyb.execute-api.${ENT_AWS_REGION}.amazonaws.com/user`;
        try {
          const resp = await fetch(apiUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
          });
          if (!resp.ok) { lastEntitlementCheckMs = now; lastEntitlementIsPro = false; resolve(false); return; }
          const json = await resp.json();
          const tier = json && (json.tier === 'pro' ? 'pro' : 'free');
          const trialStartDate = json && typeof json.trialStartDate === 'string' ? json.trialStartDate : null;
          try { chrome.storage.local.set({ userTier: tier, userTrialStartDate: trialStartDate || null }); } catch (_) {}
          lastEntitlementCheckMs = now;
          lastEntitlementIsPro = (tier === 'pro');
          resolve(lastEntitlementIsPro);
        } catch (_) {
          lastEntitlementCheckMs = now;
          lastEntitlementIsPro = false;
          resolve(false);
        }
      });
    } catch (_) { resolve(false); }
  });
}

/**
 * Generate SVG version of the quote
 * @param {string} text - The quote text
 * @param {Array} gradient - The gradient colors
 * @param {boolean} includeWatermark - Whether to include watermark
 * @returns {string} SVG data URL
 */
function generateSVGQuote(text, gradient, includeWatermark = true) {
  // Create a temporary canvas to measure text
  const canvas = new OffscreenCanvas(800, 400);
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 28px Arial";
  
  // Wrap text using existing function
  const lines = wrapText(ctx, text, 720);
  const lineHeight = 36;
  const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
  
  // Determine text color based on gradient
  const brightness = getBrightness(gradient[0]);
  const textColor = brightness > 200 ? "#000000" : "#ffffff";
  
  // Generate SVG content
  let svgContent = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${gradient[0]};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${gradient[1]};stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="800" height="400" fill="url(#bg-gradient)" />
      
      <!-- Text -->
      <g font-family="Arial" font-weight="bold" font-size="28" fill="${textColor}" text-anchor="middle">
  `;
  
  // Add each line of text
  lines.forEach((line, i) => {
    svgContent += `<text x="400" y="${startY + i * lineHeight}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>\n`;
  });
  
  svgContent += `</g>`;
  
  // Add watermark if requested
  if (includeWatermark) {
    // Calculate average brightness for smart watermark color
    const startBrightness = getBrightness(gradient[0]);
    const endBrightness = getBrightness(gradient[1]);
    const avgBrightness = (startBrightness + endBrightness) / 2;
    
    // Choose watermark color based on background brightness
    let watermarkColor;
    if (avgBrightness > 150) {
      // Light background - use dark watermark
      watermarkColor = "rgba(0,0,0,0.6)";
    } else {
      // Dark background - use light watermark
      watermarkColor = "rgba(255,255,255,0.6)";
    }
    
    svgContent += `
      <text x="785" y="385" font-family="Arial" font-size="16" font-weight="bold" fill="${watermarkColor}" text-anchor="end">made with Quotura</text>
    `;
  }
  
  svgContent += `</svg>`;
  
  // Convert to data URL
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
}

/**
 * Text wrapping algorithm for canvas/SVG rendering
 * Preserves user-inserted newlines and wraps each paragraph to the given width
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @param {string} text - Text to wrap (may include \n)
 * @param {number} maxWidth - Maximum width in pixels for each line
 * @returns {string[]} Array of text lines that fit within maxWidth, preserving blank lines
 */
function wrapText(ctx, text, maxWidth) {
  const allLines = [];
  const paragraphs = String(text).split(/\r?\n/);

  paragraphs.forEach((paragraph) => {
    // Preserve intentional blank lines
    if (paragraph.length === 0) {
      allLines.push("");
      return;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? currentLine + " " + word : word;

      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    allLines.push(currentLine);
  });

  return allLines;
}

/**
 * Calculate brightness of a hex color to determine optimal text color
 * Uses luminance formula weighted for human eye sensitivity
 * @param {string} hex - Hex color code (e.g., "#4facfe")
 * @returns {number} Brightness value (0-255, higher = brighter)
 */
function getBrightness(hex) {
  // Convert hex to RGB integer
  const rgb = parseInt(hex.slice(1), 16);
  
  // Extract individual RGB components using bitwise operations
  const r = (rgb >> 16) & 0xff;  // Red component
  const g = (rgb >> 8) & 0xff;   // Green component  
  const b = rgb & 0xff;          // Blue component
  
  // Calculate perceived brightness using standard luminance formula
  // Weights: Red=29.9%, Green=58.7%, Blue=11.4% (human eye sensitivity)
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Load an ImageBitmap from a data URL
async function loadImageBitmapFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

// Draw an image to cover the canvas (like CSS background-size: cover)
function drawImageCover(ctx, imageBitmap, targetWidth, targetHeight) {
  const sourceWidth = imageBitmap.width;
  const sourceHeight = imageBitmap.height;
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  const dx = Math.floor((targetWidth - drawWidth) / 2);
  const dy = Math.floor((targetHeight - drawHeight) / 2);
  ctx.drawImage(imageBitmap, dx, dy, drawWidth, drawHeight);
}

// Compute approximate average brightness of an image by downscaling
async function computeAverageBrightnessFromImageBitmap(imageBitmap) {
  const sampleWidth = 8;
  const sampleHeight = 8;
  const tmp = new OffscreenCanvas(sampleWidth, sampleHeight);
  const tctx = tmp.getContext("2d");
  drawImageCover(tctx, imageBitmap, sampleWidth, sampleHeight);
  const imageData = tctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let sum = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    sum += (r * 299 + g * 587 + b * 114) / 1000;
  }
  return sum / (imageData.length / 4);
}

function pickTextColorFromBrightness(avgBrightness) {
  return avgBrightness > 200 ? "#000000" : "#ffffff";
}

function addWatermarkForBrightness(ctx, width, height, avgBrightness) {
  ctx.save();
  const watermarkColor = avgBrightness > 150 ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.6)";
  ctx.fillStyle = watermarkColor;
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("made with Quotura", width - 15, height - 15);
  ctx.restore();
}

// Generate image using a custom background image (cover fit)
async function generateQuoteImageDataWithImage(text, imageDataUrl, includeWatermark = true, font = "Arial", fontSize = 28) {
  return new Promise(async (resolve) => {
    try {
      const canvas = new OffscreenCanvas(800, 400);
      const ctx = canvas.getContext("2d");

      const bitmap = await loadImageBitmapFromDataUrl(imageDataUrl);
      drawImageCover(ctx, bitmap, canvas.width, canvas.height);

      const avgBrightness = await computeAverageBrightnessFromImageBitmap(bitmap);
      const textColor = pickTextColorFromBrightness(avgBrightness);

      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = wrapText(ctx, text, 720);
      const lineHeight = Math.round(fontSize * 1.3);
      const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

      if (includeWatermark) {
        addWatermarkForBrightness(ctx, canvas.width, canvas.height, avgBrightness);
      }

      const blob = await canvas.convertToBlob();
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    } catch (e) {
      // Fallback to gradient generation if image fails
      generateQuoteImageDataWithSettings(text, null, includeWatermark, font, fontSize).then(resolve);
    }
  });
}

// Generate SVG using a custom background image (cover fit)
async function generateSVGQuoteFromImage(text, imageDataUrl, includeWatermark = true) {
  // Estimate brightness to choose text & watermark colors
  try {
    const bitmap = await loadImageBitmapFromDataUrl(imageDataUrl);
    const avgBrightness = await computeAverageBrightnessFromImageBitmap(bitmap);
    const textColor = pickTextColorFromBrightness(avgBrightness);

    // Measure wrapped text using a temp canvas for consistency
    const tempCanvas = new OffscreenCanvas(800, 400);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = "bold 32px Arial";
    const wrappedLines = wrapText(tempCtx, text, 720);
    const lineHeight = 40;
    const startY = 200 - ((wrappedLines.length - 1) * lineHeight) / 2 + 16;

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let svgContent = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <image href="${imageDataUrl}" x="0" y="0" width="800" height="400" preserveAspectRatio="xMidYMid slice" />
      ${wrappedLines.map((line, index) => {
        const y = startY + index * lineHeight;
        return `<text x="400" y="${y}" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="${textColor}">${esc(line)}</text>`;
      }).join('\n      ')}
    `;

    if (includeWatermark) {
      const watermarkColor = avgBrightness > 150 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
      svgContent += `
        <text x="785" y="385" font-family="Arial" font-size="16" font-weight="bold" fill="${watermarkColor}" text-anchor="end">made with Quotura</text>
      `;
    }

    svgContent += `\n    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svgContent)}`;
  } catch (_) {
    // Fallback: simple white text over embedded image
    const tempCanvas = new OffscreenCanvas(800, 400);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = "bold 32px Arial";
    const wrappedLines = wrapText(tempCtx, text, 720);
    const lineHeight = 40;
    const startY = 200 - ((wrappedLines.length - 1) * lineHeight) / 2 + 16;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let svgContent = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <image href="${imageDataUrl}" x="0" y="0" width="800" height="400" preserveAspectRatio="xMidYMid slice" />
      ${wrappedLines.map((line, index) => `<text x="400" y="${startY + index * lineHeight}" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#ffffff">${esc(line)}</text>`).join('\n      ')}
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svgContent)}`;
  }
}

/**
 * Main function to generate a beautified quote image
 * Creates a canvas with gradient background and centered, wrapped text
 * @param {string} text - The selected text to beautify
 */
/**
 * Add subtle decorative pattern to enhance the background
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Array} gradient - The gradient colors for pattern styling
 */
function addSubtlePattern(ctx, width, height, gradient) {
  // Save current context state
  ctx.save();
  
  // Calculate brightness for pattern opacity
  const startBrightness = getBrightness(gradient[0]);
  const endBrightness = getBrightness(gradient[1]);
  const avgBrightness = (startBrightness + endBrightness) / 2;
  
  // More visible opacity based on background brightness
  const patternOpacity = avgBrightness > 150 ? 0.12 : 0.15;
  
  // Create subtle geometric pattern
  ctx.globalAlpha = patternOpacity;
  
  // Pattern 1: Enhanced circular dots with variation
  const dotColor = avgBrightness > 150 ? "#000000" : "#ffffff";
  ctx.fillStyle = dotColor;
  
  for (let x = 60; x < width; x += 100) {
    for (let y = 60; y < height; y += 100) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add smaller accent dots
      ctx.beginPath();
      ctx.arc(x + 25, y + 25, 1.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  
  // Pattern 2: Enhanced diagonal lines
  ctx.strokeStyle = dotColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = patternOpacity * 0.6;
  
  for (let i = 0; i < width + height; i += 150) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - height, height);
    ctx.stroke();
    
    // Add subtle cross-hatch lines
    ctx.globalAlpha = patternOpacity * 0.3;
    ctx.beginPath();
    ctx.moveTo(i + 75, 0);
    ctx.lineTo(i + 75 + height, height);
    ctx.stroke();
    ctx.globalAlpha = patternOpacity * 0.6;
  }
  
  // Pattern 3: Enhanced corner decorations
  ctx.globalAlpha = patternOpacity * 0.8;
  ctx.lineWidth = 2;
  
  // Top-left corner decoration - multiple arcs
  ctx.beginPath();
  ctx.arc(0, 0, 80, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI / 2);
  ctx.stroke();
  
  // Bottom-right corner decoration - multiple arcs
  ctx.beginPath();
  ctx.arc(width, height, 80, Math.PI, 3 * Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width, height, 120, Math.PI, 3 * Math.PI / 2);
  ctx.stroke();
  
  // Restore context state
  ctx.restore();
}

/**
 * Add watermark to the canvas with adaptive color
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Array} gradient - The gradient colors for brightness calculation
 */
function addWatermark(ctx, width, height, gradient) {
  // Save current context state
  ctx.save();
  
  // Calculate average brightness of the gradient for smart color choice
  const startBrightness = getBrightness(gradient[0]);
  const endBrightness = getBrightness(gradient[1]);
  const avgBrightness = (startBrightness + endBrightness) / 2;
  
  // Choose watermark color based on background brightness
  let watermarkColor;
  if (avgBrightness > 150) {
    // Light background - use dark watermark
    watermarkColor = "rgba(0, 0, 0, 0.6)";
  } else {
    // Dark background - use light watermark
    watermarkColor = "rgba(255, 255, 255, 0.6)";
  }
  
  // Configure watermark styling - bigger and more prominent
  ctx.fillStyle = watermarkColor;
  ctx.font = "bold 16px Arial"; // Increased size and made bold
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  
  // Add watermark text in bottom-right corner
  ctx.fillText("made with Quotura", width - 15, height - 15);
  
  // Restore context state
  ctx.restore();
}


/**
 * Generate quote image data with custom font and size settings
 * @param {string} text - The text to display
 * @param {Array} selectedGradient - The gradient colors to use (null for random)
 * @param {boolean} includeWatermark - Whether to include watermark
 * @param {string} font - Font family to use
 * @param {number} fontSize - Font size to use
 * @returns {Promise} Promise that resolves with image data
 */
function generateQuoteImageDataWithSettings(text, selectedGradient, includeWatermark = true, font = "Arial", fontSize = 28) {
  return new Promise((resolve) => {
    // Create offscreen canvas for image generation (800x400 pixels)
    const canvas = new OffscreenCanvas(800, 400);
    const ctx = canvas.getContext("2d");

    // Use provided gradient or select random one
    let gradient, finalGradient;
    if (selectedGradient) {
      finalGradient = selectedGradient;
    } else {
      // Random gradient backgrounds
      const gradients = [
        ["#4facfe", "#00f2fe"], // blue
        ["#43e97b", "#38f9d7"], // green-teal
        ["#fa709a", "#fee140"], // pink-yellow
        ["#30cfd0", "#330867"], // teal-purple
        ["#ff9a9e", "#fad0c4"], // soft pink
        ["#a1c4fd", "#c2e9fb"], // sky blue
        ["#667eea", "#764ba2"], // violet
        ["#fddb92", "#d1fdff"], // pastel
      ];
      finalGradient = gradients[Math.floor(Math.random() * gradients.length)];
      chrome.storage.local.set({ currentGradient: finalGradient });
    }

    gradient = ctx.createLinearGradient(0, 0, 800, 400);
    gradient.addColorStop(0, finalGradient[0]);
    gradient.addColorStop(1, finalGradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 400);

    // Dynamic text color based on background brightness
    const brightness = getBrightness(finalGradient[0]);
    ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff";
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = wrapText(ctx, text, 720);
    const lineHeight = Math.round(fontSize * 1.3); // Dynamic line height based on font size
    const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

    // Add watermark if requested
    if (includeWatermark) {
      addWatermark(ctx, canvas.width, canvas.height, finalGradient);
    }

    // Convert canvas to blob and resolve
    canvas.convertToBlob().then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
}

/**
 * Minimal HTML parser for B/I/U tags to styled tokens
 * Supported tags: <b>, <strong>, <i>, <em>, <u>, <br>, <p>, <div>
 * Returns a flat list of tokens with style flags and explicit newline tokens
 */
function parseSimpleHtmlToTokens(htmlString) {
  const tokens = [];
  const src = String(htmlString || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&nbsp;/gi, ' ');

  let i = 0;
  let bold = false;
  let italic = false;
  let underline = false;

  function pushText(text) {
    if (!text) return;
    // Split on newlines to create explicit newline tokens
    const parts = String(text).split('\n');
    parts.forEach((part, idx) => {
      if (part.length > 0) {
        tokens.push({ text: part, bold, italic, underline, isNewline: false });
      }
      if (idx < parts.length - 1) {
        tokens.push({ text: '\n', bold: false, italic: false, underline: false, isNewline: true });
      }
    });
  }

  while (i < src.length) {
    const ch = src[i];
    if (ch === '<') {
      const closeIdx = src.indexOf('>', i + 1);
      if (closeIdx === -1) {
        // Malformed, treat rest as text
        pushText(src.slice(i));
        break;
      }
      const rawTag = src.slice(i + 1, closeIdx).trim();
      const tag = rawTag.toLowerCase();
      // Advance past tag
      i = closeIdx + 1;

      // Normalize tag name (ignore attributes)
      const m = tag.match(/^\/?([a-z0-9]+)/);
      const name = m ? m[1] : '';
      const isClosing = tag.startsWith('/');

      if (name === 'b' || name === 'strong') {
        bold = !isClosing ? true : false;
        continue;
      }
      if (name === 'i' || name === 'em') {
        italic = !isClosing ? true : false;
        continue;
      }
      if (name === 'u') {
        underline = !isClosing ? true : false;
        continue;
      }
      if (name === 'br') {
        tokens.push({ text: '\n', bold: false, italic: false, underline: false, isNewline: true });
        continue;
      }
      if (name === 'p' || name === 'div') {
        // Treat block boundaries as line breaks
        tokens.push({ text: '\n', bold: false, italic: false, underline: false, isNewline: true });
        continue;
      }
      // Other tags are ignored
    } else {
      // Read until next tag
      const nextTag = src.indexOf('<', i);
      const text = nextTag === -1 ? src.slice(i) : src.slice(i, nextTag);
      pushText(text);
      i = nextTag === -1 ? src.length : nextTag;
    }
  }

  return tokens;
}

function computeFontStringForToken(token, fontFamily, fontSize) {
  const parts = [];
  if (token && token.italic) parts.push('italic');
  if (token && token.bold) parts.push('bold');
  parts.push(`${fontSize}px`);
  parts.push(fontFamily);
  return parts.join(' ');
}

function layoutTokensToLines(ctx, tokens, maxWidth, fontFamily, fontSize) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  function commitLine() {
    lines.push({ tokens: currentLine, width: currentWidth });
    currentLine = [];
    currentWidth = 0;
  }

  // Split text tokens into smaller tokens by spaces to improve wrapping
  function splitTokenBySpace(token) {
    const parts = token.text.split(/(\s+)/);
    return parts
      .filter((p) => p.length > 0)
      .map((p) => ({ text: p, bold: token.bold, italic: token.italic, underline: token.underline, isNewline: false }));
  }

  for (const tok of tokens) {
    if (tok.isNewline) {
      commitLine();
      continue;
    }
    const subTokens = splitTokenBySpace(tok);
    for (const st of subTokens) {
      ctx.font = computeFontStringForToken(st, fontFamily, fontSize);
      const w = ctx.measureText(st.text).width;
      if (currentWidth + w > maxWidth && currentLine.length > 0) {
        commitLine();
      }
      st._width = w;
      currentLine.push(st);
      currentWidth += w;
    }
  }
  // Push the last line if any content exists
  if (currentLine.length > 0 || lines.length === 0) {
    commitLine();
  }
  return lines;
}

function drawFormattedLines(ctx, lines, centerX, startY, lineHeight, fontFamily, fontSize, textColor) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  const underlineThickness = Math.max(1, Math.round(fontSize / 16));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = startY + i * lineHeight;
    const xStart = centerX - (line.width || 0) / 2;
    let x = xStart;
    for (const tok of line.tokens) {
      ctx.font = computeFontStringForToken(tok, fontFamily, fontSize);
      ctx.fillStyle = textColor;
      ctx.fillText(tok.text, x, y);
      if (tok.underline && tok.text.trim().length > 0) {
        ctx.strokeStyle = textColor;
        ctx.lineWidth = underlineThickness;
        ctx.beginPath();
        // approximate underline position relative to middle baseline
        const underlineY = y + Math.round(fontSize * 0.45);
        ctx.moveTo(x, underlineY);
        ctx.lineTo(x + (tok._width || ctx.measureText(tok.text).width), underlineY);
        ctx.stroke();
      }
      x += tok._width || ctx.measureText(tok.text).width;
    }
  }
}

/**
 * Generate quote image using gradient background and formatted HTML (B/I/U)
 */
function generateQuoteImageDataWithSettingsHtml(html, selectedGradient, includeWatermark = true, font = 'Arial', fontSize = 28) {
  return new Promise((resolve) => {
    const canvas = new OffscreenCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    // Resolve gradient (use selected or random like text version)
    let finalGradient;
    if (selectedGradient) {
      finalGradient = selectedGradient;
    } else {
      const gradients = [
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#30cfd0', '#330867'],
        ['#ff9a9e', '#fad0c4'],
        ['#a1c4fd', '#c2e9fb'],
        ['#667eea', '#764ba2'],
        ['#fddb92', '#d1fdff'],
      ];
      finalGradient = gradients[Math.floor(Math.random() * gradients.length)];
      try { chrome.storage.local.set({ currentGradient: finalGradient }); } catch (_) {}
    }

    const gradient = ctx.createLinearGradient(0, 0, 800, 400);
    gradient.addColorStop(0, finalGradient[0]);
    gradient.addColorStop(1, finalGradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 400);

    const brightness = getBrightness(finalGradient[0]);
    const textColor = brightness > 200 ? '#000000' : '#ffffff';

    // Layout and draw formatted content
    const tokens = parseSimpleHtmlToTokens(html);
    const lines = layoutTokensToLines(ctx, tokens, 720, font, fontSize);
    const lineHeight = Math.round(fontSize * 1.3);
    const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
    drawFormattedLines(ctx, lines, 400, startY, lineHeight, font, fontSize, textColor);

    if (includeWatermark) {
      addWatermark(ctx, canvas.width, canvas.height, finalGradient);
    }

    canvas.convertToBlob().then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
}

/**
 * Generate quote image using custom image background and formatted HTML (B/I/U)
 */
function generateQuoteImageDataWithImageHtml(html, imageDataUrl, includeWatermark = true, font = 'Arial', fontSize = 28) {
  return new Promise(async (resolve) => {
    try {
      const canvas = new OffscreenCanvas(800, 400);
      const ctx = canvas.getContext('2d');
      const bitmap = await loadImageBitmapFromDataUrl(imageDataUrl);
      drawImageCover(ctx, bitmap, canvas.width, canvas.height);

      const avgBrightness = await computeAverageBrightnessFromImageBitmap(bitmap);
      const textColor = pickTextColorFromBrightness(avgBrightness);

      const tokens = parseSimpleHtmlToTokens(html);
      const lines = layoutTokensToLines(ctx, tokens, 720, font, fontSize);
      const lineHeight = Math.round(fontSize * 1.3);
      const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
      drawFormattedLines(ctx, lines, 400, startY, lineHeight, font, fontSize, textColor);

      if (includeWatermark) {
        addWatermarkForBrightness(ctx, canvas.width, canvas.height, avgBrightness);
      }

      const blob = await canvas.convertToBlob();
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    } catch (e) {
      // Fallback to non-HTML version if anything fails
      generateQuoteImageDataWithSettings(html, null, includeWatermark, font, fontSize).then(resolve);
    }
  });
}

/**
 * Generate quote image data with a specific gradient (maintains color consistency)
 * @param {string} text - The selected text to beautify
 * @param {Array} selectedGradient - The gradient colors to use
 * @param {boolean} includeWatermark - Whether to include watermark
 * @returns {Promise} Promise that resolves with image data
 */
function generateQuoteImageDataWithGradient(text, selectedGradient, includeWatermark = true) {
  return new Promise((resolve) => {
    // Create offscreen canvas for image generation (800x400 pixels)
    const canvas = new OffscreenCanvas(800, 400);
    const ctx = canvas.getContext("2d");

    // Use the provided gradient
    const gradient = ctx.createLinearGradient(0, 0, 800, 400);
    gradient.addColorStop(0, selectedGradient[0]);
    gradient.addColorStop(1, selectedGradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 400);



    // Dynamic text color based on background brightness
    const brightness = getBrightness(selectedGradient[0]);
    ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff";
    ctx.font = "bold 28px Arial"; // Default font - will be overridden by font-specific function
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = wrapText(ctx, text, 720);
    const lineHeight = 36;
    const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

    // Add watermark if requested
    if (includeWatermark) {
      addWatermark(ctx, canvas.width, canvas.height, selectedGradient);
    }

      // Convert canvas to blob and resolve
      canvas.convertToBlob().then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
}

/**
 * Generate quote image data (used for both watermarked and non-watermarked versions)
 * @param {string} text - The selected text to beautify
 * @param {boolean} includeWatermark - Whether to include watermark
 * @returns {Promise} Promise that resolves with image data
 */
function generateQuoteImageData(text, includeWatermark = true) {
  return new Promise((resolve) => {
    // Create offscreen canvas for image generation (800x400 pixels)
    const canvas = new OffscreenCanvas(800, 400);
    const ctx = canvas.getContext("2d");

    // Random gradient backgrounds
    const gradients = [
      ["#4facfe", "#00f2fe"], // blue
      ["#43e97b", "#38f9d7"], // green-teal
      ["#fa709a", "#fee140"], // pink-yellow
      ["#30cfd0", "#330867"], // teal-purple
      ["#ff9a9e", "#fad0c4"], // soft pink
      ["#a1c4fd", "#c2e9fb"], // sky blue
      ["#667eea", "#764ba2"], // violet
      ["#fddb92", "#d1fdff"], // pastel
    ];
    
    // Always select a new random gradient for fresh generation
    const selected = gradients[Math.floor(Math.random() * gradients.length)];
    // Store the selected gradient immediately for potential regeneration (watermark removal/SVG)
    chrome.storage.local.set({ currentGradient: selected });
      
      const gradient = ctx.createLinearGradient(0, 0, 800, 400);
      gradient.addColorStop(0, selected[0]);
      gradient.addColorStop(1, selected[1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 800, 400);



      // Dynamic text color based on background brightness
      const brightness = getBrightness(selected[0]);
      ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff";
      
            ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = wrapText(ctx, text, 720);
      const lineHeight = 36;
      const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

      // Add watermark if requested
      if (includeWatermark) {
        addWatermark(ctx, canvas.width, canvas.height, selected);
      }

      // Convert canvas to blob and resolve
      canvas.convertToBlob().then((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
  });
}

/**
 * Generate SVG version of the quote with decorative patterns
 * @param {string} text - The text to display
 * @param {Array} gradient - Gradient colors for background
 * @param {boolean} includeWatermark - Whether to include watermark
 * @param {string} font - Font family to use
 * @returns {string} SVG data URL
 */
function generateSVGQuote(text, gradient, includeWatermark = true) {
  // Calculate brightness for text color
  const startBrightness = getBrightness(gradient[0]);
  const endBrightness = getBrightness(gradient[1]);
  const avgBrightness = (startBrightness + endBrightness) / 2;

  // Dynamic text color based on background brightness
  const textColor = avgBrightness > 200 ? "#000000" : "#ffffff";
  
  // Wrap text for SVG (using a temporary canvas context)
  const tempCanvas = new OffscreenCanvas(800, 400);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px Arial";
  const wrappedLines = wrapText(tempCtx, text, 720);
  
  const lineHeight = 40;
  const startY = 200 - ((wrappedLines.length - 1) * lineHeight) / 2 + 16;

    // Create SVG content with clean gradient background and text
  let svgContent = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${gradient[0]};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${gradient[1]};stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <rect width="800" height="400" fill="url(#bgGradient)" />
      
      ${wrappedLines.map((line, index) => {
        const y = startY + index * lineHeight;
        return `<text x="400" y="${y}" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="${textColor}">${line}</text>`;
      }).join('\n      ')}
    `;
  
  // Add watermark if requested
  if (includeWatermark) {
    // Calculate average brightness for smart watermark color
    const watermarkColor = avgBrightness > 150 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    
    svgContent += `
      <text x="785" y="385" font-family="Arial" font-size="16" font-weight="bold" fill="${watermarkColor}" text-anchor="end">made with Quotura</text>
    `;
  }
  
  svgContent += `
    </svg>
  `;
  
  // Convert to data URL
  return `data:image/svg+xml;base64,${btoa(svgContent)}`;
}

// Message listener for handling requests from preview.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Non-watermarked image generation is a Pro-only capability
  if (request.action === "generateWithoutWatermark") {
    verifyProEntitlement().then((isPro) => {
      if (!isPro) { sendResponse({ ok: false, error: 'pro_required' }); return; }
      // Small delay to ensure currentGradient is properly stored
      setTimeout(() => {
        chrome.storage.local.get(["quoteText", "currentGradient", "customBackgroundImage"], (data) => {
          if (data.quoteText && data.customBackgroundImage) {
            generateQuoteImageDataWithImage(data.quoteText, data.customBackgroundImage, false).then((imageData) => {
              sendResponse({ ok: true, imageData });
            });
          } else if (data.quoteText && data.currentGradient) {
            generateQuoteImageDataWithGradient(data.quoteText, data.currentGradient, false).then((imageData) => {
              sendResponse({ ok: true, imageData });
            });
          } else if (data.quoteText) {
            // Fallback: regenerate with a random gradient if currentGradient is missing
            generateQuoteImageData(data.quoteText, false).then((imageData) => {
              sendResponse({ ok: true, imageData });
            });
          } else {
            sendResponse({ ok: false, error: 'no_text' });
          }
        });
      }, 200);
    });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "generateSVG") {
    const wantsNoWatermark = (request && request.includeWatermark === false);
    const proceed = () => {
      chrome.storage.local.get(["quoteText", "currentGradient", "customBackgroundImage"], (data) => {
        if (data.quoteText && data.customBackgroundImage) {
          generateSVGQuoteFromImage(data.quoteText, data.customBackgroundImage, request.includeWatermark).then((svgData) => {
            sendResponse({ ok: true, svgData });
          });
        } else if (data.quoteText && data.currentGradient) {
          const svgData = generateSVGQuote(data.quoteText, data.currentGradient, request.includeWatermark);
          sendResponse({ ok: true, svgData });
        } else {
          sendResponse({ ok: false, error: 'no_text' });
        }
      });
    };
    if (wantsNoWatermark) {
      verifyProEntitlement().then((isPro) => { if (!isPro) sendResponse({ ok: false, error: 'pro_required' }); else proceed(); });
    } else {
      proceed();
    }
    return true; // Keep the message channel open for async response
  }

  if (request.action === "regenerateQuote") {
    const wantsNoWatermark = !!(request && request.includeWatermark === false);
    const proceed = () => {
      chrome.storage.local.get(["currentGradient", "customBackgroundImage"], (data) => {
        if (data.customBackgroundImage) {
          generateQuoteImageDataWithImage(request.text, data.customBackgroundImage, request.includeWatermark).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        } else if (data.currentGradient) {
          generateQuoteImageDataWithGradient(request.text, data.currentGradient, request.includeWatermark).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        } else {
          // Fallback: regenerate with new gradient if currentGradient is missing
          generateQuoteImageData(request.text, request.includeWatermark).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        }
      });
    };
    if (wantsNoWatermark) {
      verifyProEntitlement().then((isPro) => { if (!isPro) sendResponse({ ok: false, error: 'pro_required' }); else proceed(); });
    } else {
      proceed();
    }
    return true; // Keep the message channel open for async response
  }

  if (request.action === "regenerateWithSettings") {
    const wantsNoWatermark = !!(request && request.includeWatermark === false);
    const proceed = () => {
      chrome.storage.local.get(["currentGradient", "customBackgroundImage"], (data) => {
        const incomingHtml = (request && typeof request.html === 'string' && request.html.trim().length > 0) ? request.html : null;
        if (data.customBackgroundImage) {
          const generator = incomingHtml ? generateQuoteImageDataWithImageHtml : generateQuoteImageDataWithImage;
          generator(incomingHtml || request.text, data.customBackgroundImage, request.includeWatermark, request.font, request.fontSize).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        } else if (data.currentGradient) {
          const generator = incomingHtml ? generateQuoteImageDataWithSettingsHtml : generateQuoteImageDataWithSettings;
          generator(incomingHtml || request.text, data.currentGradient, request.includeWatermark, request.font, request.fontSize).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        } else {
          // Fallback: regenerate with new gradient if currentGradient is missing
          const generator = incomingHtml ? generateQuoteImageDataWithSettingsHtml : generateQuoteImageDataWithSettings;
          generator(incomingHtml || request.text, null, request.includeWatermark, request.font, request.fontSize).then((imageData) => {
            chrome.storage.local.set({ quoteImage: imageData });
            sendResponse({ ok: true, imageData });
          });
        }
      });
    };
    if (wantsNoWatermark) {
      verifyProEntitlement().then((isPro) => { if (!isPro) sendResponse({ ok: false, error: 'pro_required' }); else proceed(); });
    } else {
      proceed();
    }
    return true; // Keep the message channel open for async response
  }
});

function createQuoteImage(text) {
  // Clear old image data first to prevent showing stale content
  chrome.storage.local.remove(['quoteImage'], () => {
    // Store the original text for later use and clear any stale formatted HTML
    // Clearing quoteTextHtml prevents previous session's formatted content from overriding new selection
    chrome.storage.local.set({ quoteText: text, quoteTextHtml: null });

    // Prefer custom image or persisted gradient if available
    chrome.storage.local.get(['customBackgroundImage', 'currentGradient'], (data) => {
      if (data && data.customBackgroundImage) {
        generateQuoteImageDataWithImage(text, data.customBackgroundImage, true).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
        });
      } else if (data && data.currentGradient) {
        generateQuoteImageDataWithGradient(text, data.currentGradient, true).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
        });
      } else {
        // Default behavior: generate with random gradient
        generateQuoteImageData(text, true).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
        });
      }
    });
  });
}
