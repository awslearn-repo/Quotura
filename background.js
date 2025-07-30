chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "beautifyQuote",
    title: "Beautify this",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "beautifyQuote" && info.selectionText) {
    createQuoteImage(info.selectionText);
  }
});

function createQuoteImage(text) {
  // Create a canvas (offscreen)
  const canvas = new OffscreenCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 800, 400);
  gradient.addColorStop(0, "#4facfe");
  gradient.addColorStop(1, "#00f2fe");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 400);

  // Text styling
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Wrap text
  const lines = wrapText(ctx, text, 720);
  const lineHeight = 36;
  const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

  // Convert to blob and download
  canvas.convertToBlob().then((blob) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: "quote.png",
    });
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  return lines;
}
