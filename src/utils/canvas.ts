export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.display = "block";
  return canvas;
}

export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgColor: string,
  textColor: string,
): void {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = textColor;
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = textColor;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Rétouch", width / 2, height / 2 - 16);

  ctx.font = "14px system-ui, sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText(`${width} × ${height}`, width / 2, height / 2 + 16);
  ctx.globalAlpha = 1;
}
