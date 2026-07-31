import sharp from "sharp";

export type MarkedColumn = { x: number; y: number; width: number; height: number; rowCount: number; markedIndexes: number[]; ratios: number[] };

type Component = { x: number; y: number; width: number; height: number; pixels: number };

function isRed(r: number, g: number, b: number): boolean {
  return r > 140 && r - g > 30 && r - b > 30 && r > g * 1.2 && r > b * 1.2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function largestTableComponent(data: Buffer, width: number, height: number, channels: number): Component | null {
  const startY = Math.floor(height * 0.22);
  const endY = Math.floor(height * 0.9);
  const mask = new Uint8Array(width * height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      if (isRed(data[offset]!, data[offset + 1]!, data[offset + 2]!)) mask[y * width + x] = 1;
    }
  }

  const seen = new Uint8Array(width * height);
  let best: Component | null = null;
  for (let y = startY; y < endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const origin = y * width + x;
      if (!mask[origin] || seen[origin]) continue;
      const stack = [origin];
      seen[origin] = 1;
      let minX = x; let maxX = x; let minY = y; let maxY = y; let pixels = 0;
      while (stack.length) {
        const current = stack.pop()!;
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        pixels += 1;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx; const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < startY || ny >= endY) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
        }
      }
      const component = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels };
      const tableLike = component.width >= width * 0.035 && component.height >= height * 0.08;
      if (tableLike && (!best || component.pixels > best.pixels)) best = component;
    }
  }
  return best;
}

export async function detectMarkedRows(image: Buffer): Promise<MarkedColumn | null> {
  const raw = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  const component = largestTableComponent(raw.data, width, height, channels);
  if (!component) return null;

  const expectedRowHeight = Math.max(10, height * (19 / 1080));
  const rowCount = Math.max(1, Math.round(component.height / expectedRowHeight));
  const ratios: number[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const top = Math.floor(component.y + row * component.height / rowCount) + 2;
    const bottom = Math.floor(component.y + (row + 1) * component.height / rowCount) - 2;
    let red = 0; let total = 0;
    for (let y = top; y < bottom; y += 1) for (let x = component.x + 2; x < component.x + component.width - 2; x += 1) {
      const offset = (y * width + x) * channels;
      if (isRed(raw.data[offset]!, raw.data[offset + 1]!, raw.data[offset + 2]!)) red += 1;
      total += 1;
    }
    ratios.push(total ? red / total : 0);
  }
  const baseline = median(ratios);
  const markedIndexes = ratios.map((ratio, index) => ratio > Math.max(0.8, baseline + 0.25) ? index : -1).filter((index) => index >= 0);
  return { ...component, rowCount, markedIndexes, ratios };
}
