function createQuoteImage(text) {
  const canvas = document.createElement("canvas");
  const width = 800;
  const height = 400;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#4facfe");
  gradient.addColorStop(1, "#00f2fe");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Text styling
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Wrap text
  const maxWidth = width - 80;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = 36;
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });

  // Convert to image
  const imageURL = canvas.toDataURL("image/png");

  // Trigger download
  const link = document.createElement("a");
  link.download = "quote.png";
  link.href = imageURL;
  link.click();
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
