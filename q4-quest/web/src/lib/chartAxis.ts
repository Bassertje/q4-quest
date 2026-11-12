import type uPlot from 'uplot';
import { periodLabel } from './format';

/** Axis label for a chart bucket: weekday (one week), day number (a month) or short month. */
export function bucketTick(key: string, bucket: 'day' | 'month', count: number): string {
  if (bucket === 'month') return periodLabel(key);
  return count <= 7 ? periodLabel(key, true).split(' ')[0] : String(Number(key.slice(8)));
}

const LABEL_FONT_PX = 11;
const LABEL_GAP_PX = 6;

/**
 * Which bars get a label: all of them when the widest label fits in a bar's
 * slot, otherwise every k-th one (counted back from the newest bar). The text
 * widths are measured with the chart's own canvas.
 */
export function pickLabels(u: uPlot, texts: string[]): number[] {
  const n = texts.length;
  if (n === 0) return [];
  const ctx = u.ctx;
  ctx.save();
  ctx.font = `${LABEL_FONT_PX * devicePixelRatio}px Inter, system-ui, sans-serif`;
  const widest = Math.max(...texts.map((t) => ctx.measureText(t).width)) / devicePixelRatio;
  ctx.restore();
  const slot = u.bbox.width / devicePixelRatio / n;
  const step = Math.max(1, Math.ceil((widest + LABEL_GAP_PX) / slot));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/**
 * Draw x-axis labels below the plot, each centred under its own bar. A label
 * that would stick out at the left or right edge is shifted just inside the
 * chart, so nothing is cut off.
 */
export function drawXLabels(u: uPlot, labels: [number, string][], _count: number, color: string): void {
  const ctx = u.ctx;
  const dpr = devicePixelRatio;
  const { left, top, width, height } = u.bbox;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${LABEL_FONT_PX * dpr}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const y = top + height + 7 * dpr;
  for (const [i, text] of labels) {
    const half = ctx.measureText(text).width / 2;
    const centre = u.valToPos(i, 'x', true);
    const x = Math.min(left + width - half, Math.max(left + half, centre));
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
