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
  
  // State variables
  let currentImageData = null;
  let watermarkRemoved = false;
  
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
    
    // Wait a bit for the background script to generate the new image
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
          setTimeout(checkForImage, 100);
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
  
  // Event listeners for export buttons
  downloadPngBtn.addEventListener("click", downloadPNG);
  downloadSvgBtn.addEventListener("click", downloadSVG);
  copyImageBtn.addEventListener("click", copyToClipboard);
  removeWatermarkBtn.addEventListener("click", removeWatermark);
});
