import type uPlot from 'uplot';
import { periodLabel } from './format';

/** Axis label for a chart bucket: weekday (one week), day number (a month) or short month. */
export function bucketTick(key: string, bucket: 'day' | 'month', count: number): string {
  if (bucket === 'month') return periodLabel(key);
  return count <= 7 ? periodLabel(key, true).split(' ')[0] : String(Number(key.slice(8)));
}

/** Which bars get a label: every k-th, counted back from the newest so the last one is labelled. */
export function tickIndexes(count: number, maxLabels: number): number[] {
  const step = Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/**
 * Draw x-axis labels below the plot. The label of the first bar is left-aligned
 * and that of the last bar right-aligned, so neither is cut off at the edge.
 */
export function drawXLabels(u: uPlot, labels: [number, string][], count: number, color: string): void {
  const ctx = u.ctx;
  const dpr = devicePixelRatio;
  const { left, top, width, height } = u.bbox;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${11 * dpr}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const y = top + height + 7 * dpr;
  for (const [i, text] of labels) {
    if (i === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(text, left, y);
    } else if (i === count - 1) {
      ctx.textAlign = 'right';
      ctx.fillText(text, left + width, y);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(text, u.valToPos(i, 'x', true), y);
    }
  }
  ctx.restore();
}
