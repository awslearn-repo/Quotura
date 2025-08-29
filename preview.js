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
  const editTextBtn = document.getElementById("editTextBtn");               // Edit text button
  const inlineEditor = document.getElementById("inlineEditor");             // Inline editor overlay
  const inlineDoneContainer = document.getElementById("inlineDoneContainer"); // Inline Done container
  const inlineDoneBtn = document.getElementById("inlineDoneBtn");             // Inline Done button
  const editBackground = document.getElementById("editBackground");          // Background layer during editing
  
  // State variables
  let currentImageData = null;
  let watermarkRemoved = false;
  let editMode = false;
  let currentFont = "Arial";
  let currentFontSize = 28;
  let currentGradientChoice = null; // null means random
  let currentText = null;           // Current editable text content
  let regenerateDebounceId = null;  // Debounce timer id for live updates
  let inlineEditing = false;        // Whether inline editor is visible

  // Update background layer to reflect current gradient selection
  function updateEditBackgroundGradient() {
    const applyGradient = (colors) => {
      try {
        if (Array.isArray(colors) && colors.length >= 2) {
          editBackground.style.background = `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
        } else {
          // Fallback gradient
          editBackground.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
      } catch (e) {
        editBackground.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      }
    };
    if (!editBackground) return;
    if (currentGradientChoice) {
      applyGradient(currentGradientChoice);
      return;
    }
    if (isChromeAvailable()) {
      chrome.storage.local.get(["currentGradient"], (data) => {
        applyGradient((data && data.currentGradient) || null);
      });
    } else {
      applyGradient(null);
    }
  }

  // Ensure edit overlays match the rendered image size exactly
  function syncEditOverlayToImage() {
    try {
      if (!img || !editBackground || !inlineEditor) return;
      const imageWidth = img.clientWidth;
      const imageHeight = img.clientHeight;
      if (!imageWidth || !imageHeight) return;
      // Match background size to image
      editBackground.style.width = `${imageWidth}px`;
      editBackground.style.height = `${imageHeight}px`;
      // Keep editor width aligned with image for consistent typing area
      inlineEditor.style.width = `${imageWidth}px`;
      inlineEditor.style.maxWidth = `${imageWidth}px`;
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
    if (editBackground) editBackground.classList.add('active');
    if (img) img.style.visibility = 'hidden';
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
    removeWatermarkBtn.disabled = watermarkRemoved;
    if (watermarkRemoved) {
      removeWatermarkBtn.textContent = "✅ Watermark Removed";
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
      button.textContent = "⏳ Loading...";
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
      includeWatermark: !watermarkRemoved  // Include watermark unless removed
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
      copyImageBtn.textContent = "✅ Copied!";
      
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
    if (watermarkRemoved || !isChromeAvailable()) return;
    
    setButtonLoading(removeWatermarkBtn, true);
    
    // Use current font and size settings when removing watermark
    chrome.storage.local.get(["quoteText"], (data) => {
      if (data.quoteText) {
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: data.quoteText,
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
            removeWatermarkBtn.textContent = "✅ Watermark Removed";
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
   * Show support modal and proceed with watermark removal
   */
  function handleRemoveWatermarkClick() {
    if (!watermarkRemoved && isChromeAvailable()) {
      const modal = createSupportModal();
      document.body.appendChild(modal);
      setTimeout(() => {
        modal.classList.add('active');
      }, 10);
    }
    removeWatermark();
  }
  
  /**
   * Create support modal asking for voluntary contribution
   */
  function createSupportModal() {
    const modal = document.createElement('div');
    modal.className = 'support-modal';
    modal.innerHTML = `
      <div class="support-backdrop"></div>
      <div class="support-container">
        <div class="support-header">
          <h3>💛 Support Quotura</h3>
          <button class="close-btn">✕</button>
        </div>
        <div class="support-content">
          <p class="support-message"><strong>Quotura</strong> is a fast, no-frills text-to-quote tool that saves time creating and sharing beautiful quotes. It’s free to use, and your support helps keep it running and improving ☕💛.</p>
          <a href="https://ko-fi.com/s/b5f0dccba5" target="_blank" rel="noopener" class="support-cta-btn">You're Awesome</a>
          <div class="support-note">No pressure — you can still remove the watermark even if you don’t pay.</div>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('.close-btn');
    const backdrop = modal.querySelector('.support-backdrop');
    const ctaBtn = modal.querySelector('.support-cta-btn');

    const close = () => closeSupportModal(modal);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    ctaBtn.addEventListener('click', () => {
      setTimeout(() => closeSupportModal(modal), 100);
    });

    return modal;
  }
  
  /**
   * Close support modal with animation
   */
  function closeSupportModal(modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      if (modal && modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  }
  
  /**
   * Handle Quick Edit button click - shows edit panel
   */
  function handleQuickEdit() {
    if (!editMode) {
      // Enter edit mode - show panel
      editMode = true;
      editPanel.classList.add("active");
      quickEditBtn.style.opacity = "0.7";
    }
  }

  /**
   * Open inline editor overlay for editing quote content with live preview
   */
  function handleEditText() {
    openInlineEditor();
  }

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

  function openInlineEditor() {
    if (isChromeAvailable()) {
      chrome.storage.local.get(["quoteText"], (data) => {
        currentText = (data && data.quoteText) || currentText || "";
        inlineEditor.textContent = currentText;
        syncInlineEditorStyles();
        inlineEditing = true;
        inlineEditor.classList.add('active');
        if (inlineDoneContainer) inlineDoneContainer.style.display = 'block';
        showEditingVisuals();
        placeCaretAtEnd(inlineEditor);
      });
    } else {
      currentText = currentText || "";
      inlineEditor.textContent = currentText;
      syncInlineEditorStyles();
      inlineEditing = true;
      inlineEditor.classList.add('active');
      if (inlineDoneContainer) inlineDoneContainer.style.display = 'block';
      showEditingVisuals();
      placeCaretAtEnd(inlineEditor);
    }
  }

  function closeInlineEditor() {
    inlineEditing = false;
    inlineEditor.classList.remove('active');
    inlineEditor.blur();
    if (inlineDoneContainer) inlineDoneContainer.style.display = 'none';
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
          <button class="close-btn">✕</button>
        </div>
        <div class="font-options">
          ${fonts.map((font, index) => `
            <div class="font-option ${font.name === currentFont ? 'selected' : ''}" data-font="${font.name}">
              <div class="font-info">
                <div class="font-name" style="font-family: ${font.name}">${font.display}</div>
                <div class="font-desc">${font.description}</div>
              </div>
              <div class="font-sample" style="font-family: ${font.name}">${font.sample}</div>
              <div class="select-indicator">✓</div>
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
          <button class="close-btn">✕</button>
        </div>
        <div class="gradient-grid">
          ${optionsHTML}
        </div>
      </div>
    `;
    
    const closeBtn = modal.querySelector('.close-btn');
    const backdrop = modal.querySelector('.gradient-picker-backdrop');
    const options = modal.querySelectorAll('.gradient-option');
    
    const close = () => closeGradientPicker(modal);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    
    options.forEach(option => {
      option.addEventListener('click', () => {
        const data = option.getAttribute('data-colors');
        if (data === 'random') {
          // Clear stored gradient to enable random generation
          currentGradientChoice = null;
          if (isChromeAvailable()) {
            chrome.storage.local.remove('currentGradient', () => {
              regenerateWithSettings();
              showNotification('Background set to random', 'success');
              if (inlineEditing) setTimeout(() => syncInlineEditorStyles(), 0);
            });
          } else {
            regenerateWithSettings();
          }
        } else {
          try {
            const colors = JSON.parse(data);
            currentGradientChoice = colors;
            // Persist chosen gradient so background.js uses it
            if (isChromeAvailable()) {
              chrome.storage.local.set({ currentGradient: colors }, () => {
                regenerateWithSettings();
                showNotification('Background updated!', 'success');
                if (inlineEditing) setTimeout(() => syncInlineEditorStyles(), 0);
              });
            } else {
              regenerateWithSettings();
            }
          } catch (e) {}
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
    chrome.storage.local.get(["quoteText"], (data) => {
      if (data.quoteText) {
        msg.textContent = "Updating with new settings...";
        disableExportButtons();
        
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: data.quoteText,
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
      const finalText = inlineEditor.textContent || "";
      currentText = finalText;
      if (isChromeAvailable()) chrome.storage.local.set({ quoteText: finalText });
      regenerateWithSettingsUsingText(finalText);
    }

    if (editMode) {
      // Exit edit mode with animation
      editPanel.classList.add("exiting");
      editPanel.classList.remove("active");
      
      setTimeout(() => {
        editPanel.classList.remove("exiting");
        editMode = false;
        quickEditBtn.style.opacity = "1";
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
  quickEditBtn.addEventListener("click", handleQuickEdit);
  
  // Event listeners for edit panel
  fontBtn.addEventListener("click", handleFontChange);
  backgroundBtn.addEventListener("click", handleBackgroundChange);
  decreaseSizeBtn.addEventListener("click", () => handleSizeChange(-2));
  increaseSizeBtn.addEventListener("click", () => handleSizeChange(2));
  doneBtn.addEventListener("click", handleDone);
  editTextBtn.addEventListener("click", handleEditText);
  if (inlineDoneBtn) inlineDoneBtn.addEventListener('click', handleDone);
  
  // Open inline editor when image is clicked
  img.addEventListener("click", openInlineEditor);
  
  // Inline editor live update
  inlineEditor.addEventListener('input', () => {
    const newText = inlineEditor.textContent || '';
    currentText = newText;
    if (isChromeAvailable()) chrome.storage.local.set({ quoteText: newText });
    debounceRegenerateWithNewText();
  });

  // Close inline editor with Escape
  document.addEventListener('keydown', (e) => {
    if (inlineEditing && e.key === 'Escape') {
      e.preventDefault();
      closeInlineEditor();
    }
  });
  
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
