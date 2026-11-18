import type { YearReview } from './types';
import { ICONS, pixelRuns } from './icons';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
const MAX_BADGES = 20;

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

export interface ShareTile {
  label: string;
  value: string;
  unit?: string;
}

/**
 * What goes on the share card. Deliberately nothing traceable: only totals
 * for the year — no odometer value of the car, no dates or times of trips.
 */
export function shareContent(r: YearReview) {
  const c = r.charging && r.charging.sessions > 0 ? r.charging : null;
  const acPct = c ? Math.round((c.ac.sessions / c.sessions) * 100) : null;
  const tiles: ShareTile[] = [
    { label: 'Beste dag', value: r.bestDay ? nf.format(r.bestDay.km) : '–', unit: r.bestDay ? 'km' : undefined },
    { label: 'Beste week', value: r.bestWeek ? nf.format(r.bestWeek.km) : '–', unit: r.bestWeek ? 'km' : undefined },
    {
      label: 'Langste streak',
      value: r.longestStreak ? String(r.longestStreak.days) : '–',
      unit: r.longestStreak ? (r.longestStreak.days === 1 ? 'dag' : 'dagen') : undefined,
    },
    { label: 'Laadsessies', value: c ? nf.format(c.sessions) : '–' },
    { label: 'Geladen (schatting)', value: c ? nf.format(c.kwh) : '–', unit: c ? 'kWh' : undefined },
    { label: 'AC / DC', value: acPct === null ? '–' : `${acPct}/${100 - acPct}`, unit: acPct === null ? undefined : '%' },
    { label: 'Level', value: String(r.level.end) },
    { label: 'Rang', value: r.level.endRank },
  ];
  const g = r.green;
  const green: ShareTile[] = g
    ? [
        ...(g.co2Kg !== null ? [{ label: 'CO₂ bespaard', value: nf.format(g.co2Kg), unit: 'kg' }] : []),
        { label: 'Niet verbrand', value: nf.format(g.liters), unit: 'liter' },
        ...(g.trees !== null ? [{ label: 'Gelijk aan', value: new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(g.trees), unit: 'bomen' }] : []),
      ]
    : [];
  return {
    title: 'Q4 QUEST',
    green,
    year: String(r.year),
    km: nf.format(r.totalKm),
    kmDigits: String(Math.round(r.totalKm)),
    tiles,
    badges: r.newBadges.slice(0, MAX_BADGES).map((b) => b.icon),
    moreBadges: Math.max(0, r.newBadges.length - MAX_BADGES),
    badgeCount: r.newBadges.length,
    /** Laadbingo: the card at the end of the year (no dates, just squares). */
    bingo: r.bingo ? { stamped: r.bingo.card.stamped, stamps: r.bingo.stamps, bingos: r.bingo.bingos } : null,
  };
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, size: number, colors: Record<string, string>) {
  const px = size / 16;
  for (const run of pixelRuns(ICONS[icon] ?? ICONS.flag)) {
    ctx.fillStyle = colors[run.tone];
    ctx.fillRect(Math.round(x + run.x * px), Math.round(y + run.y * px), Math.ceil(run.w * px), Math.ceil(px));
  }
}

/** Shrink the font until the text fits the width. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, start: number, maxWidth: number): number {
  let size = start;
  ctx.font = `${size}px ${family}`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

/** Wait for the pixel and sans fonts, so the canvas does not fall back to system fonts. */
async function fontsReady(): Promise<void> {
  await Promise.all([
    document.fonts.load('100px "VT323"'),
    document.fonts.load('400 40px "Inter"'),
    document.fonts.load('600 40px "Inter"'),
  ]).catch(() => undefined);
  await document.fonts.ready;
}

/** Draw the 1080×1920 share card in the active theme and return it as a PNG. */
export async function renderShareCard(review: YearReview): Promise<Blob> {
  await fontsReady();
  const content = shareContent(review);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const v = {
    bg: cssVar('--bg'),
    panel: cssVar('--panel'),
    line: cssVar('--line'),
    text: cssVar('--text'),
    muted: cssVar('--muted'),
    accent: cssVar('--accent'),
    lcdBg: cssVar('--lcd-bg'),
    lcdLine: cssVar('--lcd-line'),
    lcdGhost: cssVar('--lcd-ghost'),
    lcdMuted: cssVar('--lcd-muted'),
    lcdGlow: cssVar('--lcd-glow'),
    scan: cssVar('--chart-dim'),
  };
  const PIXEL = '"VT323", monospace';
  const SANS = '"Inter", system-ui, sans-serif';
  const M = 72; // outer margin
  const W = CARD_WIDTH - 2 * M;

  // Background with faint scanlines.
  ctx.fillStyle = v.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = v.scan;
  for (let y = 0; y < CARD_HEIGHT; y += 6) ctx.fillRect(0, y, CARD_WIDTH, 2);

  // Header: brand and year.
  ctx.textBaseline = 'alphabetic';
  drawIcon(ctx, 'wheel', M, 96, 96, { '#': v.accent, '+': v.text, '-': v.muted });
  ctx.fillStyle = v.accent;
  ctx.font = `120px ${PIXEL}`;
  ctx.fillText(content.title, M + 120, 182);
  ctx.textAlign = 'right';
  ctx.fillStyle = v.text;
  ctx.fillText(content.year, CARD_WIDTH - M, 182);
  ctx.textAlign = 'left';
  ctx.fillStyle = v.muted;
  ctx.font = `400 40px ${SANS}`;
  ctx.fillText('Mijn jaaroverzicht', M, 250);

  // LCD with the kilometres driven this year (not the odometer).
  const lcdY = 300;
  const lcdH = 300;
  roundRect(ctx, M, lcdY, W, lcdH, 36);
  ctx.fillStyle = v.lcdBg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = v.lcdLine;
  ctx.stroke();
  const digits = content.kmDigits;
  const ghost = '8'.repeat(Math.max(digits.length, 5));
  const lcdSize = fitFont(ctx, `${ghost} km`, PIXEL, 300, W - 100);
  ctx.font = `${lcdSize}px ${PIXEL}`;
  const unitSize = Math.round(lcdSize * 0.32);
  const digitsWidth = ctx.measureText(ghost).width;
  const total = digitsWidth + 24 + unitSize * 1.2;
  const startX = M + (W - total) / 2;
  const baseY = lcdY + lcdH / 2 + lcdSize * 0.32;
  ctx.fillStyle = v.lcdGhost;
  ctx.fillText(ghost, startX, baseY);
  ctx.textAlign = 'right';
  ctx.shadowColor = v.lcdGlow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = v.accent;
  ctx.fillText(digits, startX + digitsWidth, baseY);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.fillStyle = v.lcdMuted;
  ctx.font = `${unitSize}px ${PIXEL}`;
  ctx.fillText('km', startX + digitsWidth + 24, baseY);
  ctx.fillStyle = v.muted;
  ctx.font = `400 40px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(`gereden in ${content.year}`, CARD_WIDTH / 2, lcdY + lcdH + 64);
  ctx.textAlign = 'left';

  // Highlights: 2 × 4 tiles.
  const gridY = lcdY + lcdH + 96;
  const gap = 18;
  const tileW = (W - gap) / 2;
  const tileH = 136;
  content.tiles.forEach((t, i) => {
    const x = M + (i % 2) * (tileW + gap);
    const y = gridY + Math.floor(i / 2) * (tileH + gap);
    roundRect(ctx, x, y, tileW, tileH, 24);
    ctx.fillStyle = v.panel;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = v.line;
    ctx.stroke();
    ctx.fillStyle = v.muted;
    ctx.font = `400 34px ${SANS}`;
    ctx.fillText(t.label, x + 32, y + 46);
    const valueSize = fitFont(ctx, t.value + (t.unit ? ` ${t.unit}` : ''), PIXEL, 80, tileW - 64);
    ctx.font = `${valueSize}px ${PIXEL}`;
    ctx.fillStyle = t.label === 'Level' || t.label === 'Rang' ? v.accent : v.text;
    ctx.fillText(t.value, x + 32, y + 112);
    if (t.unit) {
      const w = ctx.measureText(t.value).width;
      ctx.fillStyle = v.muted;
      ctx.font = `${Math.round(valueSize * 0.5)}px ${PIXEL}`;
      ctx.fillText(t.unit, x + 32 + w + 12, y + 112);
    }
  });

  // Green row: CO₂ saved, litres not burned, trees (estimates).
  let afterGrid = gridY + 4 * (tileH + gap);
  if (content.green.length) {
    const gw = (W - gap * (content.green.length - 1)) / content.green.length;
    const gh = 120;
    content.green.forEach((t, i) => {
      const x = M + i * (gw + gap);
      roundRect(ctx, x, afterGrid, gw, gh, 24);
      ctx.fillStyle = v.panel;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = v.accent;
      ctx.stroke();
      ctx.fillStyle = v.muted;
      ctx.font = `400 30px ${SANS}`;
      ctx.fillText(t.label, x + 24, afterGrid + 42);
      const size = fitFont(ctx, t.value + (t.unit ? ` ${t.unit}` : ''), PIXEL, 70, gw - 48);
      ctx.font = `${size}px ${PIXEL}`;
      ctx.fillStyle = v.text;
      ctx.fillText(t.value, x + 24, afterGrid + 100);
      if (t.unit) {
        const w = ctx.measureText(t.value).width;
        ctx.fillStyle = v.muted;
        ctx.font = `${Math.round(size * 0.5)}px ${PIXEL}`;
        ctx.fillText(t.unit, x + 24 + w + 10, afterGrid + 100);
      }
    });
    afterGrid += gh + gap;
  }

  // Laadbingo: mini card with the stamped squares.
  if (content.bingo) {
    const bh = 120;
    roundRect(ctx, M, afterGrid, W, bh, 24);
    ctx.fillStyle = v.panel;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = v.line;
    ctx.stroke();
    const cell = 8;
    const step = 10;
    const gx = M + 24;
    const gy = afterGrid + (bh - 10 * step + 2) / 2;
    const stamped = new Set(content.bingo.stamped);
    for (let n = 1; n <= 100; n++) {
      ctx.fillStyle = n === 100 ? '#F2B33D' : stamped.has(n) ? v.accent : v.line;
      ctx.fillRect(gx + ((n - 1) % 10) * step, gy + Math.floor((n - 1) / 10) * step, cell, cell);
    }
    const tx = gx + 10 * step + 32;
    ctx.fillStyle = v.muted;
    ctx.font = `400 30px ${SANS}`;
    ctx.fillText('Laadbingo', tx, afterGrid + 42);
    ctx.fillStyle = v.text;
    ctx.font = `70px ${PIXEL}`;
    ctx.fillText(String(content.bingo.stamped.length), tx, afterGrid + 100);
    const w = ctx.measureText(String(content.bingo.stamped.length)).width;
    ctx.fillStyle = v.muted;
    ctx.font = `35px ${PIXEL}`;
    ctx.fillText('/ 99', tx + w + 12, afterGrid + 100);
    // The number of bingos on the right, so the row stays as low as the green one.
    ctx.font = `400 30px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(content.bingo.bingos === 1 ? '1 bingo' : `${content.bingo.bingos} bingo's`, M + W - 24, afterGrid + 42);
    ctx.textAlign = 'left';
    afterGrid += bh + gap;
  }

  // Badges earned this year.
  const badgesY = afterGrid + 40;
  ctx.fillStyle = v.text;
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(
    content.badgeCount === 1 ? '1 nieuwe badge' : `${content.badgeCount} nieuwe badges`,
    M,
    badgesY,
  );
  // Icons shrink when space is short (e.g. with the Laadbingo row), so they never reach the footer.
  const perRow = 10;
  const rows = Math.max(1, Math.ceil(content.badges.length / perRow));
  const room = CARD_HEIGHT - 150 - (badgesY + 32);
  const iconSize = Math.max(40, Math.min(72, Math.floor((room - (rows - 1) * 24) / rows)));
  const iconGap = (W - perRow * iconSize) / (perRow - 1);
  content.badges.forEach((icon, i) => {
    const x = M + (i % perRow) * (iconSize + iconGap);
    const y = badgesY + 32 + Math.floor(i / perRow) * (iconSize + 24);
    drawIcon(ctx, icon, x, y, iconSize, { '#': v.accent, '+': v.text, '-': v.muted });
  });
  if (content.moreBadges > 0) {
    ctx.fillStyle = v.muted;
    ctx.font = `400 34px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(`+${content.moreBadges} meer`, CARD_WIDTH - M, badgesY);
    ctx.textAlign = 'left';
  }
  if (content.badgeCount === 0) {
    ctx.fillStyle = v.muted;
    ctx.font = `400 34px ${SANS}`;
    ctx.fillText('Volgend jaar meer!', M, badgesY + 70);
  }

  // Footer.
  ctx.fillStyle = v.accent;
  ctx.fillRect(M, CARD_HEIGHT - 120, W, 4);
  ctx.fillStyle = v.muted;
  ctx.font = `48px ${PIXEL}`;
  ctx.textAlign = 'center';
  ctx.fillText('Q4 QUEST', CARD_WIDTH / 2, CARD_HEIGHT - 60);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG could not be created'))), 'image/png'),
  );
}

/** Share the PNG with the system share sheet when possible, otherwise download it. */
export async function shareOrDownload(blob: Blob, year: number): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = `q4-quest-${year}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Q4 Quest ${year}` });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      // e.g. not allowed inside an iframe: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
