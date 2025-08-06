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
    // Open preview tab immediately as part of user gesture (required for popup blocking)
    chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") }, () => {
      // Generate and store the image after opening tab
      // This ensures the preview tab is ready to receive the generated image
      createQuoteImage(info.selectionText);
    });
  }
});

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
function createQuoteImage(text) {
  // Create offscreen canvas for image generation (800x400 pixels)
  const canvas = new OffscreenCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  // Predefined gradient color combinations for backgrounds
  const gradients = [
    ["#4facfe", "#00f2fe"], // blue gradient
    ["#43e97b", "#38f9d7"], // green-teal gradient
    ["#fa709a", "#fee140"], // pink-yellow gradient
    ["#30cfd0", "#330867"], // teal-purple gradient
    ["#ff9a9e", "#fad0c4"], // soft pink gradient
    ["#a1c4fd", "#c2e9fb"], // sky blue gradient
    ["#667eea", "#764ba2"], // violet gradient
    ["#fddb92", "#d1fdff"], // pastel gradient
  ];
  
  // Randomly select a gradient for variety
  const selected = gradients[Math.floor(Math.random() * gradients.length)];
  
  // Create and apply linear gradient background
  const gradient = ctx.createLinearGradient(0, 0, 800, 400); // Top-left to bottom-right
  gradient.addColorStop(0, selected[0]);    // Start color
  gradient.addColorStop(1, selected[1]);    // End color
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 400);            // Fill entire canvas

  // Determine optimal text color based on background brightness
  const brightness = getBrightness(selected[0]); // Use start color for brightness calculation
  ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff"; // Dark text on light bg, light text on dark bg
  
  // Configure text styling
  ctx.font = "bold 28px Arial";        // Bold, large font for readability
  ctx.textAlign = "center";            // Center-align text horizontally
  ctx.textBaseline = "middle";         // Center-align text vertically

  // Wrap text to fit canvas width with padding
  const lines = wrapText(ctx, text, 720); // 720px = 800px canvas - 40px padding on each side
  const lineHeight = 36;                   // Spacing between lines (28px font + 8px spacing)
  
  // Calculate starting Y position to vertically center all lines
  const startY = 200 - ((lines.length - 1) * lineHeight) / 2; // 200 = canvas center Y
  
  // Render each line of text
  lines.forEach((line, i) => 
    ctx.fillText(line, 400, startY + i * lineHeight) // 400 = canvas center X
  );

  // Convert canvas to blob and handle download/storage
  canvas.convertToBlob().then((blob) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      // Store image data in Chrome storage for preview tab access
      chrome.storage.local.set({ quoteImage: reader.result });
      
      // Automatically download the generated image
      chrome.downloads.download({
        url: reader.result,        // Data URL of the generated image
        filename: "quote.png",     // Default filename for download
      });
    };
    
    // Convert blob to data URL for storage and download
    reader.readAsDataURL(blob);
  });
}
