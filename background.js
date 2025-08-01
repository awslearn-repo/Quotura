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

// Brightness calculator for dynamic text color
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
  const selected = gradients[Math.floor(Math.random() * gradients.length)];
  const gradient = ctx.createLinearGradient(0, 0, 800, 400);
  gradient.addColorStop(0, selected[0]);
  gradient.addColorStop(1, selected[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 400);

  // Dynamic text color based on background brightness
  const brightness = getBrightness(selected[0]);
  ctx.fillStyle = brightness > 200 ? "#000000" : "#ffffff"; // black for light, white for dark
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, text, 720);
  const lineHeight = 36;
  const startY = 200 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 400, startY + i * lineHeight));

  // Convert canvas to blob → data URL → open & download
  canvas.convertToBlob().then((blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Open in new tab
      chrome.tabs.create({ url: reader.result });

      // Also download
      chrome.downloads.download({
        url: reader.result,
        filename: "quote.png",
      });
    };
    reader.readAsDataURL(blob);
  });
}
