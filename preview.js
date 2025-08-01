document.addEventListener("DOMContentLoaded", () => {
  const img = document.getElementById("image");
  const msg = document.getElementById("message");
  const btn = document.getElementById("downloadBtn");

  chrome.storage.local.get("quoteImage", (data) => {
    if (data.quoteImage) {
      img.src = data.quoteImage;
      msg.textContent = "Your beautified quote is ready!";
    } else {
      msg.textContent = "No image found!";
    }
  });

  btn.addEventListener("click", () => {
    chrome.storage.local.get("quoteImage", (data) => {
      if (data.quoteImage) {
        chrome.downloads.download({
          url: data.quoteImage,
          filename: "quote.png",
        });
      }
    });
  });
});
