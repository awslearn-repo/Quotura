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
  
  // Editor panel elements
  const editorPanel = document.getElementById("editorPanel");       // Editor panel container
  const closePanelBtn = document.getElementById("closePanelBtn");   // Close panel button
  const fontSelect = document.getElementById("fontSelect");         // Font dropdown
  const fontSizeInput = document.getElementById("fontSizeInput");   // Font size input
  const decreaseSizeBtn = document.getElementById("decreaseSizeBtn"); // Decrease size button
  const increaseSizeBtn = document.getElementById("increaseSizeBtn"); // Increase size button
  const boldBtn = document.getElementById("boldBtn");               // Bold button
  const italicBtn = document.getElementById("italicBtn");           // Italic button
  const underlineBtn = document.getElementById("underlineBtn");     // Underline button
  const colorSwatches = document.querySelectorAll(".color-swatch"); // Color swatches
  const customColorPicker = document.getElementById("customColorPicker"); // Custom color picker
  const alignLeftBtn = document.getElementById("alignLeftBtn");     // Align left button
  const alignCenterBtn = document.getElementById("alignCenterBtn"); // Align center button
  const alignRightBtn = document.getElementById("alignRightBtn");   // Align right button
  const backgroundOptions = document.querySelectorAll(".background-option"); // Background options
  const backgroundUpload = document.getElementById("backgroundUpload"); // Background upload input
  
  // State variables
  let currentImageData = null;
  let watermarkRemoved = false;
  let panelOpen = false;
  let currentFont = "Arial";
  let currentFontSize = 28;
  let currentGradientChoice = null; // null means random
  let currentText = null;           // Current editable text content
  let regenerateDebounceId = null;  // Debounce timer id for live updates
  let textSelection = null;         // Current text selection for formatting
  let currentTextColor = "#ffffff"; // Current text color
  let currentAlignment = "center";  // Current text alignment
  let currentBackgroundType = "random"; // Current background type
  let attributedText = null;        // Text with formatting attributes

  // Panel management functions
  function openEditorPanel() {
    if (!panelOpen) {
      panelOpen = true;
      editorPanel.classList.add("active");
      editorPanel.setAttribute("aria-hidden", "false");
      document.body.classList.add("panel-open");
      
      // Load current settings
      loadCurrentSettings();
      
      // Focus the first control
      if (fontSelect) fontSelect.focus();
    }
  }

  function closeEditorPanel() {
    if (panelOpen) {
      panelOpen = false;
      editorPanel.classList.add("exiting");
      editorPanel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("panel-open");
      
      // Return focus to image
      if (img) img.focus();
      
      setTimeout(() => {
        editorPanel.classList.remove("active", "exiting");
      }, 400);
    }
  }

  function loadCurrentSettings() {
    // Load font
    if (fontSelect) {
      fontSelect.value = currentFont;
    }
    
    // Load font size
    if (fontSizeInput) {
      fontSizeInput.value = currentFontSize;
    }
    
    // Load text color
    updateColorSwatches(currentTextColor);
    
    // Load alignment
    updateAlignmentButtons(currentAlignment);
    
    // Load background type
    updateBackgroundOptions(currentBackgroundType);
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
          chrome.storage.local.get(["quotura:quoteText", "quoteText"], (t) => {
            // Migration: check both old and new keys
            if (t && t["quotura:quoteText"]) {
              currentText = t["quotura:quoteText"];
            } else if (t && t.quoteText) {
              currentText = t.quoteText;
              // Migrate old key to new key
              chrome.storage.local.set({ "quotura:quoteText": t.quoteText });
              chrome.storage.local.remove("quoteText");
            }
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
  
  // Text selection and formatting functions
  function updateTextSelection() {
    // For canvas-based text editing, we'll create an overlay text area
    // that appears over the image when editing
    if (!currentText) return;
    
    // Create or update text editing overlay
    let textOverlay = document.getElementById('textOverlay');
    if (!textOverlay) {
      textOverlay = document.createElement('div');
      textOverlay.id = 'textOverlay';
      textOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        cursor: pointer;
      `;
      
      const textArea = document.createElement('textarea');
      textArea.id = 'canvasTextArea';
      textArea.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #667eea;
        border-radius: 8px;
        padding: 16px;
        font-size: ${currentFontSize}px;
        font-family: ${currentFont};
        color: ${currentTextColor};
        text-align: ${currentAlignment};
        width: 80%;
        height: 60%;
        resize: none;
        outline: none;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;
      textArea.value = currentText;
      
      textOverlay.appendChild(textArea);
      document.getElementById('imageContainer').appendChild(textOverlay);
      
      // Focus and select all text
      textArea.focus();
      textArea.select();
      
      // Handle text changes
      textArea.addEventListener('input', (e) => {
        currentText = e.target.value;
        if (isChromeAvailable()) {
          chrome.storage.local.set({ "quotura:quoteText": currentText });
        }
        debounceRegenerateWithNewText();
      });
      
      // Handle selection changes
      textArea.addEventListener('select', () => {
        const start = textArea.selectionStart;
        const end = textArea.selectionEnd;
        textSelection = { start, end, text: currentText };
        updateControlStates();
      });
      
      // Handle clicks outside to close
      textOverlay.addEventListener('click', (e) => {
        if (e.target === textOverlay) {
          closeTextOverlay();
        }
      });
      
      // Handle escape key
      textArea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeTextOverlay();
        }
      });
    }
    
    // Update text selection state
    const textArea = document.getElementById('canvasTextArea');
    if (textArea) {
      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      textSelection = { start, end, text: currentText };
      updateControlStates();
    }
  }
  
  function closeTextOverlay() {
    const textOverlay = document.getElementById('textOverlay');
    if (textOverlay) {
      textOverlay.remove();
    }
    textSelection = null;
    updateControlStates();
  }
  
  function debounceRegenerateWithNewText() {
    if (regenerateDebounceId) clearTimeout(regenerateDebounceId);
    regenerateDebounceId = setTimeout(() => {
      regenerateWithSettings();
    }, 250);
  }

  function updateControlStates() {
    const hasSelection = textSelection && textSelection.start !== textSelection.end;
    const controls = [
      fontSelect, fontSizeInput, decreaseSizeBtn, increaseSizeBtn,
      boldBtn, italicBtn, underlineBtn, ...colorSwatches, customColorPicker,
      alignLeftBtn, alignCenterBtn, alignRightBtn, ...backgroundOptions, backgroundUpload
    ];
    
    controls.forEach(control => {
      if (control) {
        control.disabled = !hasSelection;
        control.setAttribute('aria-disabled', !hasSelection);
        
        // Update tabindex for keyboard navigation
        if (control.hasAttribute('tabindex')) {
          control.setAttribute('tabindex', hasSelection ? '0' : '-1');
        }
      }
    });
    
    // Update helper text
    const helper = document.getElementById('selection-helper');
    if (helper) {
      helper.textContent = hasSelection ? 'Text selected - formatting enabled' : 'Select text to enable formatting';
    }
  }

  function updateColorSwatches(selectedColor) {
    colorSwatches.forEach(swatch => {
      const color = swatch.dataset.color;
      swatch.classList.toggle('active', color === selectedColor);
    });
    if (customColorPicker) {
      customColorPicker.value = selectedColor;
    }
  }

  function updateAlignmentButtons(selectedAlignment) {
    [alignLeftBtn, alignCenterBtn, alignRightBtn].forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', btn.id === `align${selectedAlignment.charAt(0).toUpperCase() + selectedAlignment.slice(1)}Btn`);
      }
    });
  }

  function updateBackgroundOptions(selectedType) {
    backgroundOptions.forEach(option => {
      const type = option.dataset.type;
      option.classList.toggle('active', type === selectedType);
    });
  }
  
  // Panel control handlers
  function handleFontChange() {
    if (fontSelect && !fontSelect.disabled) {
      currentFont = fontSelect.value;
      
      // Apply font to textarea
      const textArea = document.getElementById('canvasTextArea');
      if (textArea) {
        textArea.style.fontFamily = currentFont;
      }
      
      regenerateWithSettings();
      showNotification(`Font changed to ${currentFont}!`, "success");
    }
  }

  function handleFontSizeChange() {
    if (fontSizeInput && !fontSizeInput.disabled) {
      const newSize = parseInt(fontSizeInput.value);
      if (newSize >= 12 && newSize <= 60) {
        currentFontSize = newSize;
        
        // Apply font size to textarea
        const textArea = document.getElementById('canvasTextArea');
        if (textArea) {
          textArea.style.fontSize = currentFontSize + 'px';
        }
        
        regenerateWithSettings();
        showNotification(`Font size changed to ${currentFontSize}px!`, "success");
      } else {
        fontSizeInput.value = currentFontSize; // Reset to current value
        showNotification("Font size must be between 12px and 60px", "error");
      }
    }
  }

  function handleSizeButtonChange(delta) {
    const newSize = currentFontSize + delta;
    if (newSize >= 12 && newSize <= 60) {
      currentFontSize = newSize;
      if (fontSizeInput) fontSizeInput.value = currentFontSize;
      regenerateWithSettings();
      showNotification(`Font size ${delta > 0 ? 'increased' : 'decreased'} to ${currentFontSize}px!`, "success");
    } else {
      const limit = newSize < 12 ? "minimum" : "maximum";
      const limitValue = newSize < 12 ? "12px" : "60px";
      showNotification(`${limit} font size is ${limitValue}`, "error");
    }
  }

  function handleFormattingChange(formatType) {
    if (!textSelection || textSelection.start === textSelection.end) {
      showNotification("Please select some text to format", "error");
      return;
    }
    
    // Apply formatting to selected text in the textarea
    const textArea = document.getElementById('canvasTextArea');
    if (textArea) {
      const start = textSelection.start;
      const end = textSelection.end;
      const selectedText = textArea.value.substring(start, end);
      
      let formattedText = selectedText;
      switch (formatType) {
        case 'bold':
          formattedText = `<b>${selectedText}</b>`;
          break;
        case 'italic':
          formattedText = `<i>${selectedText}</i>`;
          break;
        case 'underline':
          formattedText = `<u>${selectedText}</u>`;
          break;
      }
      
      // Replace the selected text with formatted text
      const newText = textArea.value.substring(0, start) + formattedText + textArea.value.substring(end);
      textArea.value = newText;
      currentText = newText;
      
      // Update selection to cover the new formatted text
      textArea.setSelectionRange(start, start + formattedText.length);
      
      if (isChromeAvailable()) {
        chrome.storage.local.set({ quoteText: currentText });
      }
      
      showNotification(`${formatType} formatting applied!`, "success");
      debounceRegenerateWithNewText();
    }
  }

  function handleColorChange(color) {
    if (!textSelection || textSelection.start === textSelection.end) {
      showNotification("Please select some text to change color", "error");
      return;
    }
    
    currentTextColor = color;
    updateColorSwatches(color);
    
    // Apply color to selected text
    const textArea = document.getElementById('canvasTextArea');
    if (textArea) {
      const start = textSelection.start;
      const end = textSelection.end;
      const selectedText = textArea.value.substring(start, end);
      const coloredText = `<span style="color: ${color}">${selectedText}</span>`;
      
      const newText = textArea.value.substring(0, start) + coloredText + textArea.value.substring(end);
      textArea.value = newText;
      currentText = newText;
      
      // Update selection
      textArea.setSelectionRange(start, start + coloredText.length);
      
      if (isChromeAvailable()) {
        chrome.storage.local.set({ quoteText: currentText });
      }
      
      showNotification(`Text color changed!`, "success");
      debounceRegenerateWithNewText();
    }
  }

  function handleAlignmentChange(alignment) {
    currentAlignment = alignment;
    updateAlignmentButtons(alignment);
    
    // Apply alignment to the textarea
    const textArea = document.getElementById('canvasTextArea');
    if (textArea) {
      textArea.style.textAlign = alignment;
    }
    
    showNotification(`Text alignment changed to ${alignment}!`, "success");
    regenerateWithSettings();
  }

  function handleBackgroundChange(type) {
    currentBackgroundType = type;
    updateBackgroundOptions(type);
    
    if (type === 'random') {
      currentGradientChoice = null;
      showNotification('Background set to random', 'success');
    } else if (type === 'transparent') {
      currentGradientChoice = 'transparent';
      showNotification('Background set to transparent', 'success');
    } else if (type === 'preset') {
      // Open gradient picker modal
      handleBackgroundChange();
      return;
    } else if (type === 'upload') {
      if (backgroundUpload) {
        backgroundUpload.click();
      }
      return;
    }
    
    regenerateWithSettings();
  }
  
  // Background gradient picker (simplified version)
  function openGradientPicker() {
    const modal = createGradientPickerModal();
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }
  
  // Background gradient picker modal (simplified)
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
      `<div class="gradient-option transparent-option" data-colors="transparent">
        <div class="gradient-swatch transparent-pattern"></div>
        <div class="gradient-name">Transparent</div>
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
          currentGradientChoice = null;
          currentBackgroundType = 'random';
          updateBackgroundOptions('random');
          if (isChromeAvailable()) {
            chrome.storage.local.remove(['customBackgroundImage', 'currentGradient'], () => {
              regenerateWithSettings();
              showNotification('Background set to random', 'success');
            });
          } else {
            regenerateWithSettings();
          }
        } else if (data === 'transparent') {
          currentGradientChoice = 'transparent';
          currentBackgroundType = 'transparent';
          updateBackgroundOptions('transparent');
          regenerateWithSettings();
          showNotification('Background set to transparent', 'success');
        } else {
          try {
            const colors = JSON.parse(data);
            currentGradientChoice = colors;
            currentBackgroundType = 'preset';
            updateBackgroundOptions('preset');
            if (isChromeAvailable()) {
              chrome.storage.local.set({ currentGradient: colors }, () => {
                chrome.storage.local.remove('customBackgroundImage', () => {
                  regenerateWithSettings();
                  showNotification('Background updated!', 'success');
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
          📁 Upload from device…
        </div>
        <div class="gradient-name">Upload from device…</div>
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
  
  // This function is now handled by handleSizeButtonChange above
  
  /**
   * Regenerate image with current font and size settings
   */
  function regenerateWithSettings() {
    if (!isChromeAvailable()) {
      msg.textContent = "Settings updated (preview only)";
      return;
    }
    chrome.storage.local.get(["quotura:quoteText", "quoteText"], (data) => {
      // Migration: check both old and new keys
      const text = data["quotura:quoteText"] || data.quoteText;
      if (text) {
        msg.textContent = "Updating with new settings...";
        disableExportButtons();
        
        // Handle transparent background
        if (currentGradientChoice === 'transparent') {
          // For transparent background, we'll need to modify the background script
          // For now, just use a random gradient
          currentGradientChoice = null;
        }
        
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: text,
          font: currentFont,
          fontSize: currentFontSize,
          includeWatermark: !watermarkRemoved,
          gradient: currentGradientChoice,
          backgroundType: currentBackgroundType,
          textColor: currentTextColor,
          alignment: currentAlignment
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
  
  // Initialize panel state
  updateControlStates();
   
  // Event listeners for export buttons
  downloadPngBtn.addEventListener("click", downloadPNG);
  downloadSvgBtn.addEventListener("click", downloadSVG);
  copyImageBtn.addEventListener("click", copyToClipboard);
  removeWatermarkBtn.addEventListener("click", handleRemoveWatermarkClick);
  
  // Event listeners for editor panel
  if (closePanelBtn) {
    closePanelBtn.addEventListener("click", closeEditorPanel);
  }
  
  // Open panel and text editing when image is clicked
  img.addEventListener("click", () => {
    openEditorPanel();
    updateTextSelection();
  });
  
  // Panel control event listeners
  if (fontSelect) {
    fontSelect.addEventListener("change", handleFontChange);
  }
  
  if (fontSizeInput) {
    fontSizeInput.addEventListener("change", handleFontSizeChange);
    fontSizeInput.addEventListener("input", handleFontSizeChange);
  }
  
  if (decreaseSizeBtn) {
    decreaseSizeBtn.addEventListener("click", () => handleSizeButtonChange(-2));
  }
  
  if (increaseSizeBtn) {
    increaseSizeBtn.addEventListener("click", () => handleSizeButtonChange(2));
  }
  
  // Formatting buttons
  if (boldBtn) {
    boldBtn.addEventListener("click", () => handleFormattingChange("bold"));
  }
  
  if (italicBtn) {
    italicBtn.addEventListener("click", () => handleFormattingChange("italic"));
  }
  
  if (underlineBtn) {
    underlineBtn.addEventListener("click", () => handleFormattingChange("underline"));
  }
  
  // Color controls
  colorSwatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      if (!swatch.disabled) {
        handleColorChange(swatch.dataset.color);
      }
    });
    
    // Keyboard support for color swatches
    swatch.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !swatch.disabled) {
        e.preventDefault();
        handleColorChange(swatch.dataset.color);
      }
    });
  });
  
  if (customColorPicker) {
    customColorPicker.addEventListener("change", (e) => {
      if (!e.target.disabled) {
        handleColorChange(e.target.value);
      }
    });
  }
  
  // Alignment controls
  if (alignLeftBtn) {
    alignLeftBtn.addEventListener("click", () => handleAlignmentChange("left"));
  }
  
  if (alignCenterBtn) {
    alignCenterBtn.addEventListener("click", () => handleAlignmentChange("center"));
  }
  
  if (alignRightBtn) {
    alignRightBtn.addEventListener("click", () => handleAlignmentChange("right"));
  }
  
  // Background controls
  backgroundOptions.forEach(option => {
    option.addEventListener("click", () => {
      if (!option.disabled) {
        handleBackgroundChange(option.dataset.type);
      }
    });
    
    // Keyboard support for background options
    option.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !option.disabled) {
        e.preventDefault();
        handleBackgroundChange(option.dataset.type);
      }
    });
  });
  
  if (backgroundUpload) {
    backgroundUpload.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          currentGradientChoice = null;
          if (isChromeAvailable()) {
            chrome.storage.local.set({ customBackgroundImage: reader.result }, () => {
              chrome.storage.local.remove('currentGradient', () => {
                regenerateWithSettings();
                showNotification('Background image updated!', 'success');
              });
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Close panel with Escape
  document.addEventListener('keydown', (e) => {
    if (panelOpen && e.key === 'Escape') {
      e.preventDefault();
      closeEditorPanel();
    }
  });
  
  // Simulate text selection for demo (in real app, this would come from canvas text selection)
  updateTextSelection();
  
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
