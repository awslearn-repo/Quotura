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
        // This fallback ensures the extension continues working even if gradient data is lost
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
 * Text wrapping algorithm for canvas rendering
 * Breaks text into lines that fit within specified width constraints
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width in pixels for each line
 * @returns {string[]} Array of text lines that fit within maxWidth
 */
function wrapText(ctx, text, maxWidth) {
  // Respect explicit newlines from user input by splitting first
  const paragraphs = String(text).split(/\r?\n/);
  const wrapped = [];

  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p].split(" ");
    let line = "";
    
    for (let n = 0; n < words.length; n++) {
      const word = words[n];
      const testLine = line + word + (n < words.length ? " " : "");

      if (ctx.measureText(testLine).width > maxWidth && line) {
        wrapped.push(line.trim());
        line = word + " ";
      } else {
        line = testLine;
      }
    }

    wrapped.push(line.trim());
  }

  return wrapped;
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
  if (request.action === "generateWithoutWatermark") {
    // Small delay to ensure currentGradient is properly stored
    setTimeout(() => {
      chrome.storage.local.get(["quoteText", "currentGradient"], (data) => {
        if (data.quoteText && data.currentGradient) {
          generateQuoteImageDataWithGradient(data.quoteText, data.currentGradient, false).then((imageData) => {
            sendResponse({ imageData: imageData });
          });
        } else if (data.quoteText) {
          // Fallback: regenerate with a random gradient if currentGradient is missing
          generateQuoteImageData(data.quoteText, false).then((imageData) => {
            sendResponse({ imageData: imageData });
          });
        }
      });
    }, 200);
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === "generateSVG") {
    chrome.storage.local.get(["quoteText", "currentGradient"], (data) => {
      if (data.quoteText && data.currentGradient) {
        const svgData = generateSVGQuote(data.quoteText, data.currentGradient, request.includeWatermark);
        sendResponse({ svgData: svgData });
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === "regenerateQuote") {
    chrome.storage.local.get(["currentGradient"], (data) => {
      if (data.currentGradient) {
        generateQuoteImageDataWithGradient(request.text, data.currentGradient, request.includeWatermark).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
          sendResponse({ imageData: imageData });
        });
      } else {
        // Fallback: regenerate with new gradient if currentGradient is missing
        generateQuoteImageData(request.text, request.includeWatermark).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
          sendResponse({ imageData: imageData });
        });
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === "regenerateWithSettings") {
    chrome.storage.local.get(["currentGradient"], (data) => {
      if (data.currentGradient) {
        generateQuoteImageDataWithSettings(request.text, data.currentGradient, request.includeWatermark, request.font, request.fontSize).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
          sendResponse({ imageData: imageData });
        });
      } else {
        // Fallback: regenerate with new gradient if currentGradient is missing
        generateQuoteImageDataWithSettings(request.text, null, request.includeWatermark, request.font, request.fontSize).then((imageData) => {
          chrome.storage.local.set({ quoteImage: imageData });
          sendResponse({ imageData: imageData });
        });
      }
    });
    return true; // Keep the message channel open for async response
  }
});

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
