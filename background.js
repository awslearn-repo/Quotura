// Extension initialization - runs when extension is installed or enabled
chrome.runtime.onInstalled.addListener(() => {
  // Create right-click context menu item for selected text
  chrome.contextMenus.create({
    id: "beautifyQuote",           // Unique identifier for this menu item
    title: "Beautify this",       // Text displayed in context menu
    contexts: ["selection"],      // Only show when text is selected
  });
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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateWithoutWatermark") {
    // Get stored text and current gradient to maintain consistency
    chrome.storage.local.get(["quoteText", "currentGradient"], (data) => {
      if (data.quoteText && data.currentGradient) {
        generateQuoteImageDataWithGradient(data.quoteText, data.currentGradient, false).then((imageData) => {
          sendResponse({ imageData });
        });
      } else {
        // Fallback: if no gradient stored, use the original function (shouldn't happen)
        console.warn("No currentGradient found, using fallback");
        generateQuoteImageData(data.quoteText, false).then((imageData) => {
          sendResponse({ imageData });
        });
      }
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === "generateSVG") {
    // Generate SVG version of the quote
    chrome.storage.local.get(["quoteText", "currentGradient"], (data) => {
      if (data.quoteText) {
        const svgData = generateSVGQuote(data.quoteText, data.currentGradient, request.includeWatermark);
        sendResponse({ svgData });
      }
    });
    return true; // Keep message channel open for async response
  }
});

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
    svgContent += `
      <text x="790" y="390" font-family="Arial" font-size="12" fill="rgba(255,255,255,0.3)" text-anchor="end">made with Quotura</text>
    `;
  }
  
  svgContent += `</svg>`;
  
  // Convert to data URL
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
}

/**
 * Text wrapping algorithm for canvas rendering
 * Breaks text into lines that fit within specified width constraints
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width in pixels for each line
 * @returns {string[]} Array of text lines that fit within maxWidth
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  
  // Process each word and build lines
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    
    // Check if adding this word exceeds maxWidth
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      // Current line is full, save it and start new line
      lines.push(line.trim());
      line = words[n] + " ";
    } else {
      // Word fits, add it to current line
      line = testLine;
    }
  }
  
  // Add the final line
  lines.push(line.trim());
  return lines;
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

/**
 * Main function to generate a beautified quote image
 * Creates a canvas with gradient background and centered, wrapped text
 * @param {string} text - The selected text to beautify
 */
/**
 * Add watermark to the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
function addWatermark(ctx, width, height) {
  // Save current context state
  ctx.save();
  
  // Configure watermark styling
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)"; // Semi-transparent white
  ctx.font = "12px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  
  // Add watermark text in bottom-right corner
  ctx.fillText("made with Quotura", width - 10, height - 10);
  
  // Restore context state
  ctx.restore();
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
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = wrapText(ctx, text, 720);
    const lineHeight = 36;
    const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

                // Add watermark if requested
      if (includeWatermark) {
        addWatermark(ctx, canvas.width, canvas.height);
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
        addWatermark(ctx, canvas.width, canvas.height);
      }

      // Convert canvas to blob and resolve
      canvas.convertToBlob().then((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
  });
}

function createQuoteImage(text) {
  // Clear old image data first to prevent showing stale content
  chrome.storage.local.remove(['quoteImage'], () => {
    // Store the original text for later use
    chrome.storage.local.set({ quoteText: text });
    
    // Generate image with watermark by default, but don't auto-download
    generateQuoteImageData(text, true).then((imageData) => {
      // Only save image data in Chrome storage for preview tab access
      chrome.storage.local.set({ quoteImage: imageData });
    });
  });
}
