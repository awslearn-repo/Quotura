// Wait for DOM to fully load before executing script
// This ensures all HTML elements are available for manipulation
document.addEventListener("DOMContentLoaded", () => {
  // Get references to key DOM elements
  const img = document.getElementById("image");      // Image container for generated quote
  const msg = document.getElementById("message");    // Status message element
  const btn = document.getElementById("downloadBtn"); // Re-download button

  // Retrieve the generated quote image from Chrome's local storage
  // This was stored by background.js after image generation
  chrome.storage.local.get("quoteImage", (data) => {
    if (data.quoteImage) {
      // Image found - display it and update status message
      img.src = data.quoteImage;                    // Set image source to data URL
      msg.textContent = "Your beautified quote is ready!";
    } else {
      // No image found - show error message
      // This shouldn't normally happen if user follows proper workflow
      msg.textContent = "No image found!";
    }
  });

  // Handle re-download button clicks
  btn.addEventListener("click", () => {
    // Retrieve image data again from storage
    chrome.storage.local.get("quoteImage", (data) => {
      if (data.quoteImage) {
        // Trigger download using Chrome's downloads API
        // This creates a new download with the same image data
        chrome.downloads.download({
          url: data.quoteImage,      // Data URL containing the image
          filename: "quote.png",     // Default filename for the download
        });
      }
    });
  });
});
