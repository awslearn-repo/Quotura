// Wait for DOM to fully load before executing script
// This ensures all HTML elements are available for manipulation
document.addEventListener("DOMContentLoaded", () => {
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
  
  // State variables
  let currentImageData = null;
  let watermarkRemoved = false;
  let editMode = false;
  let currentFont = "Arial";
  let currentFontSize = 28;
  
  // Initialize the preview page
  initializePreview();
  
  /**
   * Initialize the preview page by loading the generated image
   */
  function initializePreview() {
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
    removeWatermarkBtn.disabled = false;
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
    if (!currentImageData) return;
    
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
    if (watermarkRemoved) return;
    
    setButtonLoading(removeWatermarkBtn, true);
    
    // Small delay to ensure gradient is properly stored
    setTimeout(() => {
      // Request image generation without watermark from background script
      chrome.runtime.sendMessage({
        action: "generateWithoutWatermark"
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
    }, 200); // 200ms delay to ensure storage is complete
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
   * Handle font selection
   */
  function handleFontChange() {
    const fonts = [
      { name: "Arial", display: "Arial - Clean & Professional" },
      { name: "Impact", display: "Impact - Bold & Strong" },
      { name: "Georgia", display: "Georgia - Elegant Serif" },
      { name: "Trebuchet MS", display: "Trebuchet MS - Modern Sans" },
      { name: "Courier New", display: "Courier New - Monospace" }
    ];
    
    let fontList = "Choose a font:\n\n";
    fonts.forEach((font, index) => {
      fontList += `${index + 1}. ${font.display}\n`;
    });
    
    const choice = prompt(fontList + "\nEnter number (1-5):");
    const fontIndex = parseInt(choice) - 1;
    
    if (fontIndex >= 0 && fontIndex < fonts.length) {
      currentFont = fonts[fontIndex].name;
      regenerateWithSettings();
      showNotification(`Font changed to ${fonts[fontIndex].name}!`, "success");
    }
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
    chrome.storage.local.get(["quoteText"], (data) => {
      if (data.quoteText) {
        msg.textContent = "Updating with new settings...";
        disableExportButtons();
        
        chrome.runtime.sendMessage({
          action: "regenerateWithSettings",
          text: data.quoteText,
          font: currentFont,
          fontSize: currentFontSize,
          includeWatermark: !watermarkRemoved
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
  }
   
   // Event listeners for export buttons
  downloadPngBtn.addEventListener("click", downloadPNG);
  downloadSvgBtn.addEventListener("click", downloadSVG);
  copyImageBtn.addEventListener("click", copyToClipboard);
  removeWatermarkBtn.addEventListener("click", removeWatermark);
  
  // Event listener for quick edit
  quickEditBtn.addEventListener("click", handleQuickEdit);
  
  // Event listeners for edit panel
  fontBtn.addEventListener("click", handleFontChange);
  decreaseSizeBtn.addEventListener("click", () => handleSizeChange(-2));
  increaseSizeBtn.addEventListener("click", () => handleSizeChange(2));
  doneBtn.addEventListener("click", handleDone);
  
  // Interactive blob functionality
  initializeInteractiveBlobs();
});

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
