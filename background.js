chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "beautifyQuote",
    title: "Beautify this",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "beautifyQuote" && info.selectionText) {
    createQuoteImage(info.selectionText);
  }
});

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  return lines;
}

function getBrightness(hex) {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function createQuoteImage(text) {
  const canvas = new OffscreenCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  const gradients = [
    ["#4facfe", "#00f2fe"],
    ["#43e97b", "#38f9d7"],
    ["#fa709a", "#fee140"],
    ["#30cfd0", "#330867"],
    ["#ff9a9e", "#fad0c4"],
    ["#a1c4fd", "#c2e9fb"],
    ["#667eea", "#764ba2"],
    ["#fddb92", "#d1fdff"],
  ];
  const selected = gradients[Math.floor(Math.random() * gradients.length)];
  const gradient = ctx.createLinearGradient(0, 0, 800, 400);
  gradient.addColorStop(0, selected[0]);
  gradient.addColorStop(1, selected[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 400);

  const brightness = getBrightness(selected[0]);
  ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, text, 720);
  const lineHeight = 36;
  const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

  canvas.convertToBlob().then((blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;

      // Save image data for preview
      chrome.storage.local.set({ quoteImage: dataUrl }, () => {
        const previewUrl = chrome.runtime.getURL("preview.html");
        chrome.tabs.create({ url: previewUrl });
      });

      // Download and open the image
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: "quote.png",
        },
        (downloadId) => {
          if (downloadId) {
            chrome.downloads.open(downloadId);
          } else {
            console.error("Download failed");
          }
        }
      );
    };
    reader.readAsDataURL(blob);
  });
}
