// Text and pictures for the city, drawn on 2D canvases and used as textures:
// building name signs, the street's neon signs, stop numbers and screens.
// Canvas text handles Arabic shaping and right-to-left order by itself.

import { CanvasTexture, SRGBColorSpace } from "three";

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext("2d")];
}

export function canvasTexture(canvas, anisotropy = 4) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** A three.js colour as a CSS colour, with optional transparency. */
export function css(color, alpha = 1) {
  const hex = color.getHex();
  return `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Text as a neon tube: a coloured glow with a bright core. */
export function neonText(ctx, text, x, y, { size, color, family, weight = 800, glow = 0.42 }) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = size * glow;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * glow * 0.35;
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Breaks `text` into at most `maxLines` lines, shrinking the font until they fit `maxWidth`. */
export function fitText(ctx, text, { maxWidth, maxLines, size, minSize, family, weight = 800 }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  for (let current = size; current >= minSize; current -= 4) {
    ctx.font = `${weight} ${current}px ${family}`;
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    const fits = lines.length <= maxLines && lines.every((entry) => ctx.measureText(entry).width <= maxWidth);
    if (fits || current - 4 < minSize) return { lines: lines.slice(0, maxLines), size: current };
  }
  return { lines: [String(text)], size: minSize };
}

function panel(ctx, width, height, color, { radius = 26, inset = 9, fill = "rgba(3, 6, 16, 0.88)" } = {}) {
  roundedRect(ctx, inset, inset, width - inset * 2, height - inset * 2, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

/** The name plate over a building's entrance: a small label and the project's title. */
export function drawTitleSign({ title, label, color, family, rtl }) {
  const [canvas, ctx] = makeCanvas(1024, 340);
  const tone = css(color);
  ctx.direction = rtl ? "rtl" : "ltr";
  panel(ctx, 1024, 340, tone);

  ctx.font = `700 30px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = css(color, 0.95);
  ctx.fillText(label, 512, 60);
  const labelWidth = ctx.measureText(label).width;
  ctx.fillStyle = css(color, 0.5);
  ctx.fillRect(512 - labelWidth / 2 - 150, 59, 120, 2);
  ctx.fillRect(512 + labelWidth / 2 + 30, 59, 120, 2);

  const { lines, size } = fitText(ctx, title, { maxWidth: 900, maxLines: 2, size: 96, minSize: 40, family });
  const lineHeight = size * 1.18;
  const top = 200 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => neonText(ctx, line, 512, top + index * lineHeight, { size, color: tone, family }));
  return canvas;
}

/** A holographic line or two of text with no backing, for the end of the street. */
export function drawHoloText({ lines, color, family, rtl }) {
  const [canvas, ctx] = makeCanvas(1024, 300);
  ctx.direction = rtl ? "rtl" : "ltr";
  const tone = css(color);
  const sizes = lines.map((line) => fitText(ctx, line, { maxWidth: 940, maxLines: 1, size: 104, minSize: 44, family }).size);
  const size = Math.min(...sizes);
  const lineHeight = size * 1.25;
  const top = 150 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => neonText(ctx, line, 512, top + index * lineHeight, { size, color: tone, family, glow: 0.5 }));
  return canvas;
}

export const ATLAS = { cols: 16, rows: 2, cellWidth: 128, cellHeight: 512 };

/**
 * One texture holding every vertical street sign. Short words are stacked letter
 * by letter, longer ones are turned on their side, as on real neon signs.
 */
export function drawSignAtlas({ words, colors, family }) {
  const { cols, rows, cellWidth, cellHeight } = ATLAS;
  const [canvas, ctx] = makeCanvas(cols * cellWidth, rows * cellHeight);
  const count = Math.min(words.length, cols * rows);
  for (let index = 0; index < count; index += 1) {
    const word = words[index].toUpperCase();
    const tone = css(colors[index % colors.length]);
    ctx.save();
    ctx.translate((index % cols) * cellWidth, Math.floor(index / cols) * cellHeight);
    panel(ctx, cellWidth, cellHeight, tone, { radius: 18, inset: 7, fill: "rgba(3, 6, 16, 0.84)" });
    const letters = [...word.replace(/\s+/g, "")];
    if (letters.length <= 9) {
      const step = Math.min(78, (cellHeight - 60) / letters.length);
      const top = cellHeight / 2 - ((letters.length - 1) * step) / 2;
      letters.forEach((letter, row) => neonText(ctx, letter, cellWidth / 2, top + row * step, { size: step * 0.86, color: tone, family }));
    } else {
      ctx.translate(cellWidth / 2, cellHeight / 2);
      ctx.rotate(-Math.PI / 2);
      const { size } = fitText(ctx, word, { maxWidth: cellHeight - 70, maxLines: 1, size: 72, minSize: 30, family });
      neonText(ctx, word, 0, 0, { size, color: tone, family });
    }
    ctx.restore();
  }
  return { canvas, count };
}

export const SHOP_ATLAS = { cols: 4, rows: 8, cellWidth: 256, cellHeight: 64 };

/**
 * One texture holding the names over the shop fronts, white on black, a name
 * to a cell. The building material lights each sign's letters through it (see
 * facade in kit.js).
 */
export function drawShopNames({ names, family }) {
  const { cols, rows, cellWidth, cellHeight } = SHOP_ATLAS;
  const [canvas, ctx] = makeCanvas(cols * cellWidth, rows * cellHeight);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < cols * rows; index += 1) {
    const name = names[index % names.length];
    const { size } = fitText(ctx, name, { maxWidth: cellWidth - 22, maxLines: 1, size: 46, minSize: 22, family, weight: 800 });
    ctx.font = `800 ${size}px ${family}`;
    ctx.fillText(name, (index % cols) * cellWidth + cellWidth / 2, Math.floor(index / cols) * cellHeight + cellHeight / 2 + 2);
  }
  return canvas;
}

/** The ring and number painted on the ground in front of a stop. Drawn on black for additive blending. */
export function drawStopMarker({ number, color }) {
  const [canvas, ctx] = makeCanvas(512, 512);
  const tone = css(color);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = tone;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(256, 256, 232, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 16]);
  ctx.beginPath();
  ctx.arc(256, 256, 204, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = tone;
  ctx.font = `800 196px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number, 256, 268);
  return canvas;
}

/** A holographic sign for a building that is still being built: its name and how far along it is. */
export function drawProgressSign({ name, progress, color, family, rtl }) {
  const [canvas, ctx] = makeCanvas(768, 256);
  const tone = css(color);
  ctx.direction = rtl ? "rtl" : "ltr";
  panel(ctx, 768, 256, tone, { radius: 22 });
  const { lines, size } = fitText(ctx, name, { maxWidth: 680, maxLines: 1, size: 60, minSize: 28, family });
  neonText(ctx, lines[0], 384, 78, { size, color: tone, family, glow: 0.3 });

  // The bar always fills from the left, with the percentage beside it.
  const barX = 52;
  const barWidth = 500;
  ctx.strokeStyle = css(color, 0.7);
  ctx.lineWidth = 3;
  roundedRect(ctx, barX, 150, barWidth, 46, 12);
  ctx.stroke();
  ctx.fillStyle = tone;
  roundedRect(ctx, barX + 7, 157, Math.max(14, ((barWidth - 14) * progress) / 100), 32, 8);
  ctx.fill();
  ctx.font = `800 58px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillText(`${progress}%`, barX + barWidth + 26, 175);
  return canvas;
}

/** Shown on a building's screen when the project has no picture (or it fails to load): the year over a grid. */
export function drawScreenFallback({ year, color }) {
  const [canvas, ctx] = makeCanvas(640, 360);
  const tone = css(color);
  const background = ctx.createLinearGradient(0, 0, 640, 360);
  background.addColorStop(0, "#050a16");
  background.addColorStop(1, css(color, 0.26));
  ctx.fillStyle = "#050a16";
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = css(color, 0.16);
  ctx.lineWidth = 1;
  for (let x = 0; x <= 640; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 360);
    ctx.stroke();
  }
  for (let y = 0; y <= 360; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }
  if (year) neonText(ctx, year, 320, 172, { size: 168, color: tone, family: MONO, glow: 0.22 });
  // A row of small bars under it, like a level meter.
  ctx.fillStyle = css(color, 0.75);
  for (let bar = 0; bar < 9; bar += 1) ctx.fillRect(212 + bar * 25, 286, 16, 10 + ((bar * 37) % 23));
  return canvas;
}

/** The rings painted on the plaza at the end of the street. Drawn on black for additive blending. */
export function drawPlazaRings({ color }) {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = css(color);
  for (const [radius, width, dash] of [
    [490, 8, null],
    [440, 3, [40, 22]],
    [330, 5, null],
    [300, 2, [10, 14]],
    [190, 4, [70, 30]],
  ]) {
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.beginPath();
    ctx.arc(512, 512, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  for (let step = 0; step < 24; step += 1) {
    const angle = (step / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(512 + Math.cos(angle) * 350, 512 + Math.sin(angle) * 350);
    ctx.lineTo(512 + Math.cos(angle) * (step % 2 === 0 ? 425 : 385), 512 + Math.sin(angle) * (step % 2 === 0 ? 425 : 385));
    ctx.stroke();
  }
  return canvas;
}
