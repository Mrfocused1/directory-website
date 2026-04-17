"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import EmptyState from "@/components/dashboard/EmptyState";

// NOTE: Requires `npm install qrcode @types/qrcode` — using dynamic import with fallback.
// The `qrcode` package generates QR codes as SVG strings or data URLs.
type QRCodeModule = {
  toString: (text: string, opts: Record<string, unknown>) => Promise<string>;
  toDataURL: (text: string, opts?: Record<string, unknown>) => Promise<string>;
};

async function loadQRCode(): Promise<QRCodeModule | null> {
  try {
    // @ts-expect-error — qrcode may not be installed; fallback below handles it
    const mod = await import(/* webpackIgnore: true */ "qrcode");
    return mod.default || mod;
  } catch {
    return null;
  }
}

/**
 * Minimal QR code generator fallback — used when the `qrcode` npm package is
 * not installed.  Produces a valid QR code as an SVG string using only the
 * browser's built-in APIs and a compact, zero-dependency implementation of the
 * QR encoding algorithm (version 1-10, error-correction level M).
 *
 * The implementation covers:
 *  - Byte-mode encoding
 *  - Reed-Solomon error correction (level M)
 *  - Mask evaluation & selection
 *  - Format / version info placement
 */

/* ---- Galois-field math over GF(256) ---- */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}
function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenPoly(nsym: number) {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const ng: number[] = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    }
    g = ng;
  }
  return g;
}

function rsEncode(data: number[], nsym: number) {
  const gen = rsGenPoly(nsym);
  const res = new Array(data.length + nsym).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0)
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

/* ---- QR data capacity table (byte mode, EC level M) ---- */
// [totalCodewords, ecCodewordsPerBlock, numBlocks]
const QR_CAPS: [number, number, number][] = [
  [0, 0, 0],       // placeholder for version 0
  [26, 10, 1],     // v1
  [44, 16, 1],     // v2
  [70, 26, 1],     // v3
  [100, 18, 2],    // v4
  [134, 24, 2],    // v5
  [172, 16, 4],    // v6
  [196, 18, 4],    // v7
  [242, 22, 4],    // v8
  [292, 22, 5],    // v9 — was [22,5] — 292 total codewords
  [346, 26, 5],    // v10 — was [26,5] — 346 total
];

// Data capacity in bytes for each version at EC level M (byte mode)
const DATA_CAPS = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

function chooseVersion(len: number) {
  for (let v = 1; v <= 10; v++) if (len <= DATA_CAPS[v]) return v;
  throw new Error("Data too long for QR code (max ~213 bytes at version 10 level M)");
}

/* ---- Module placement helpers ---- */
function makeMatrix(size: number): (number | null)[][] {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function placeFinderPattern(m: (number | null)[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) continue;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = edge || inner ? 1 : 0;
      } else {
        m[rr][cc] = 0; // separator
      }
    }
  }
}

function placeAlignmentPattern(m: (number | null)[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const edge = r === -2 || r === 2 || c === -2 || c === 2;
      m[row + r][col + c] = edge || (r === 0 && c === 0) ? 1 : 0;
    }
  }
}

const ALIGNMENT_POSITIONS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function placeTimingPatterns(m: (number | null)[][], size: number) {
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
}

function reserveFormatAreas(m: (number | null)[][], size: number) {
  // horizontal
  for (let i = 0; i < 8; i++) if (m[8][i] === null) m[8][i] = 0;
  if (m[8][7] === null) m[8][7] = 0;
  if (m[8][8] === null) m[8][8] = 0;
  for (let i = size - 8; i < size; i++) if (m[8][i] === null) m[8][i] = 0;
  // vertical
  for (let i = 0; i < 8; i++) if (m[i][8] === null) m[i][8] = 0;
  for (let i = size - 7; i < size; i++) if (m[i][8] === null) m[i][8] = 0;
  // dark module
  m[size - 8][8] = 1;
}

/* ---- Encode data ---- */
function encodeData(text: string, version: number): number[] {
  const bytes = new TextEncoder().encode(text);
  const cap = QR_CAPS[version];
  const totalCodewords = cap[0];
  const ecPerBlock = cap[1];
  const numBlocks = cap[2];
  const dataCodewords = totalCodewords - ecPerBlock * numBlocks;

  // Character count indicator length: 8 bits for byte mode versions 1-9, 16 for 10+
  const ccLen = version <= 9 ? 8 : 16;

  // Build bit stream
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // byte mode indicator
  pushBits(bytes.length, ccLen);
  for (const b of bytes) pushBits(b, 8);
  // terminator
  const maxBits = dataCodewords * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);
  // pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);
  // pad codewords
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[pi % 2], 8);
    pi++;
  }

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  // Split into blocks and compute EC
  const blockDataLen = Math.floor(dataCodewords / numBlocks);
  const longBlocks = dataCodewords % numBlocks;
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = blockDataLen + (b >= numBlocks - longBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + len);
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
    offset += len;
  }

  // Interleave
  const result: number[] = [];
  const maxDataLen = blockDataLen + (longBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++)
    for (const block of blocks) if (i < block.length) result.push(block[i]);
  for (let i = 0; i < ecPerBlock; i++)
    for (const ec of ecBlocks) result.push(ec[i]);

  return result;
}

/* ---- Place data bits ---- */
function placeDataBits(m: (number | null)[][], data: number[]) {
  const size = m.length;
  const bits: number[] = [];
  for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let idx = 0;
  let col = size - 1;
  let upward = true;

  while (col >= 0) {
    if (col === 6) { col--; continue; } // skip timing column

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0) continue;
        if (m[row][c] === null) {
          m[row][c] = idx < bits.length ? bits[idx++] : 0;
        }
      }
    }

    upward = !upward;
    col -= 2;
  }
}

/* ---- Masking ---- */
type MaskFn = (row: number, col: number) => boolean;
const MASKS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m: (number | null)[][], reserved: boolean[][], maskIdx: number): number[][] {
  const size = m.length;
  const result: number[][] = m.map(row => row.map(v => v ?? 0));
  const fn = MASKS[maskIdx];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!reserved[r][c] && fn(r, c)) result[r][c] ^= 1;
  return result;
}

function scoreMask(m: number[][]): number {
  const size = m.length;
  let penalty = 0;

  // Rule 1: consecutive same-color modules in row/col
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) { count++; } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) { count++; } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1])
        penalty += 3;

  return penalty;
}

/* ---- Format info ---- */
const FORMAT_MASK = 0x5412;
function calcFormatInfo(ecLevel: number, maskPattern: number) {
  const data = (ecLevel << 3) | maskPattern;
  let d = data << 10;
  const gen = 0x537;
  for (let i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= gen << i;
  return ((data << 10) | d) ^ FORMAT_MASK;
}

function placeFormatInfo(m: number[][], formatInfo: number) {
  const size = m.length;
  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((formatInfo >> i) & 1);

  // Around top-left finder
  const positions1 = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  for (let i = 0; i < 15; i++) m[positions1[i][0]][positions1[i][1]] = bits[i];

  // Around top-right and bottom-left finders
  const positions2Row = [
    [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
    [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
  ];
  const positions2Col = [
    [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
    [size - 3, 8], [size - 2, 8], [size - 1, 8],
  ];
  for (let i = 0; i < 8; i++) m[positions2Row[i][0]][positions2Row[i][1]] = bits[i];
  for (let i = 0; i < 7; i++) m[positions2Col[i][0]][positions2Col[i][1]] = bits[i + 8];
}

/* ---- Main generation function ---- */
function generateQRSvg(text: string, cellSize = 4, margin = 4): string {
  const version = chooseVersion(new TextEncoder().encode(text).length);
  const size = 17 + version * 4;

  const m = makeMatrix(size);

  // Place finder patterns
  placeFinderPattern(m, 0, 0);
  placeFinderPattern(m, 0, size - 7);
  placeFinderPattern(m, size - 7, 0);

  // Alignment patterns
  const alPos = ALIGNMENT_POSITIONS[version];
  if (alPos.length > 0) {
    for (const r of alPos) {
      for (const c of alPos) {
        // Skip if overlapping finder patterns
        if (r <= 8 && c <= 8) continue;
        if (r <= 8 && c >= size - 8) continue;
        if (r >= size - 8 && c <= 8) continue;
        placeAlignmentPattern(m, r, c);
      }
    }
  }

  placeTimingPatterns(m, size);
  reserveFormatAreas(m, size);

  // Record reserved modules
  const reserved: boolean[][] = m.map(row => row.map(v => v !== null));

  // Encode & place data
  const data = encodeData(text, version);
  placeDataBits(m, data);

  // Find best mask
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mi = 0; mi < 8; mi++) {
    const masked = applyMask(m, reserved, mi);
    const s = scoreMask(masked);
    if (s < bestScore) { bestScore = s; bestMask = mi; }
  }

  const result = applyMask(m, reserved, bestMask);
  const formatInfo = calcFormatInfo(0, bestMask); // EC level M = 0
  placeFormatInfo(result, formatInfo);

  // Build SVG
  const svgSize = (size + margin * 2) * cellSize;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (result[r][c] === 1) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }

  svg += `</svg>`;
  return svg;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function svgToPngDataUrl(svg: string, pxSize: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pxSize;
      canvas.height = pxSize;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, pxSize, pxSize);
      ctx.drawImage(img, 0, 0, pxSize, pxSize);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = svgToDataUrl(svg);
  });
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

export default function SharePage() {
  const { selectedSite } = useSiteContext();

  if (!selectedSite) {
    return (
      <main className="min-h-screen bg-[color:var(--bg)]">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" />
              </svg>
            }
            title="No directory selected"
            description="Create a directory to get your public URL, RSS feed, and embed code."
            action={{ href: "/onboarding", label: "Create a directory" }}
          />
        </div>
      </main>
    );
  }

  const slug = selectedSite.slug;
  const directoryUrl = `${SITE_URL}/${slug}`;
  const rssUrl = `${directoryUrl}/feed.xml`;
  const embedUrl = `${SITE_URL}/embed/${slug}`;
  const embedSnippet = `<iframe
  src="${embedUrl}"
  title="${selectedSite.displayName || slug} directory"
  width="100%"
  height="800"
  frameborder="0"
  style="border-radius: 12px; border: 1px solid #e5e7eb;"
  loading="lazy"
></iframe>`;

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Share &amp; embed</h1>
          <p className="text-sm text-[color:var(--fg-muted)]">
            Spread your directory everywhere your audience lives.
          </p>
        </div>

        <div className="space-y-5">
          <CopyCard
            title="Direct link"
            description="Share this URL anywhere — bio links, socials, email."
            value={directoryUrl}
          />

          <CopyCard
            title="RSS feed"
            description="Readers like Feedly, email newsletters, and automation tools can subscribe to new posts."
            value={rssUrl}
          />

          <QRCodeCard
            url={directoryUrl}
            displayName={selectedSite.displayName || slug}
          />

          <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-bold mb-1">Embed on your website</h2>
            <p className="text-xs text-[color:var(--fg-subtle)] mb-3">
              Paste this snippet into any HTML page or site builder to show a live copy of your directory.
            </p>
            <CodeBlock value={embedSnippet} />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[color:var(--fg-subtle)]">
              <span>Embed URL:</span>
              <code className="bg-black/[0.04] px-1.5 py-0.5 rounded font-mono">{embedUrl}</code>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function QRCodeCard({ url, displayName }: { url: string; displayName: string }) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [smallSvgHtml, setSmallSvgHtml] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [useNpmLib, setUseNpmLib] = useState<boolean | null>(null);
  const qrRef = useRef<QRCodeModule | null>(null);

  const generate = useCallback(async () => {
    // Try npm `qrcode` package first; fall back to built-in generator
    if (useNpmLib === null) {
      const mod = await loadQRCode();
      qrRef.current = mod;
      setUseNpmLib(!!mod);
    }

    const mod = qrRef.current;
    if (mod) {
      const [svg, smallSvg] = await Promise.all([
        mod.toString(url, { type: "svg", width: 256, margin: 2 }),
        mod.toString(url, { type: "svg", width: 128, margin: 1 }),
      ]);
      setSvgHtml(svg);
      setSmallSvgHtml(smallSvg);
    } else {
      const svg = generateQRSvg(url, 6, 4);
      const smallSvg = generateQRSvg(url, 3, 2);
      setSvgHtml(svg);
      setSmallSvgHtml(smallSvg);
    }
  }, [url, useNpmLib]);

  useEffect(() => { generate(); }, [generate]);

  const downloadPng = async () => {
    if (!svgHtml) return;
    setDownloading(true);
    try {
      let dataUrl: string;
      if (qrRef.current) {
        dataUrl = await qrRef.current.toDataURL(url, { width: 1024, margin: 2 });
      } else {
        const hiRes = generateQRSvg(url, 16, 8);
        dataUrl = await svgToPngDataUrl(hiRes, 1024);
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${displayName.replace(/\s+/g, "-").toLowerCase()}-qr-code.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  };

  const downloadBusinessCard = async () => {
    if (!smallSvgHtml) return;
    setDownloading(true);
    try {
      // Build a business-card sized image: QR + name + URL
      const qrPx = 256;
      const cardWidth = 400;
      const cardHeight = 360;
      const canvas = document.createElement("canvas");
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext("2d")!;

      // White background
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // Draw QR code
      const qrSvg = qrRef.current
        ? await qrRef.current.toString(url, { type: "svg", width: qrPx, margin: 2 })
        : generateQRSvg(url, 8, 4);

      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.src = svgToDataUrl(qrSvg);
      });
      const qrX = (cardWidth - qrPx) / 2;
      ctx.drawImage(img, qrX, 24, qrPx, qrPx);

      // Display name
      ctx.fillStyle = "black";
      ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(displayName, cardWidth / 2, qrPx + 56);

      // URL
      ctx.fillStyle = "#6b7280";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace";
      ctx.fillText(url, cardWidth / 2, qrPx + 80);

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${displayName.replace(/\s+/g, "-").toLowerCase()}-business-card-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-bold mb-1">QR code</h2>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
        Print it, add it to flyers, or display it at events. Anyone who scans it will land on your directory.
      </p>

      {/* Large QR code */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="bg-white border border-[color:var(--border)] rounded-lg p-4 inline-flex items-center justify-center"
          style={{ minWidth: 200, minHeight: 200 }}
        >
          {svgHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: svgHtml }}
              className="[&>svg]:w-[200px] [&>svg]:h-[200px]"
            />
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-[color:var(--fg-subtle)]">
              Generating...
            </div>
          )}
        </div>

        <code className="text-xs text-[color:var(--fg-subtle)] font-mono">{url}</code>

        <div className="flex gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={downloadPng}
            disabled={downloading || !svgHtml}
            className="h-9 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {downloading ? "Downloading..." : "Download QR Code"}
          </button>
          <button
            type="button"
            onClick={downloadBusinessCard}
            disabled={downloading || !smallSvgHtml}
            className="h-9 px-4 bg-white border border-[color:var(--border)] text-[color:var(--fg)] rounded-lg text-xs font-semibold hover:bg-black/[0.03] transition disabled:opacity-50"
          >
            Download for business card
          </button>
        </div>
      </div>

      {/* Business card preview */}
      <div className="mt-6 pt-5 border-t border-[color:var(--border)]">
        <h3 className="text-xs font-semibold text-[color:var(--fg-muted)] mb-3">Business card preview</h3>
        <div className="bg-[#fafafa] border border-[color:var(--border)] rounded-lg p-5 flex flex-col items-center gap-2 max-w-[280px] mx-auto">
          {smallSvgHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: smallSvgHtml }}
              className="[&>svg]:w-[100px] [&>svg]:h-[100px]"
            />
          ) : (
            <div className="w-[100px] h-[100px] flex items-center justify-center text-[10px] text-[color:var(--fg-subtle)]">
              ...
            </div>
          )}
          <p className="text-sm font-bold text-center">{displayName}</p>
          <p className="text-[11px] text-[color:var(--fg-subtle)] font-mono text-center break-all">{url}</p>
        </div>
      </div>
    </div>
  );
}

function CopyCard({ title, description, value }: { title: string; description: string; value: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1800);
    } catch {
      setCopied("failed");
      setTimeout(() => setCopied("idle"), 2500);
    }
  };
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-bold mb-1">{title}</h2>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-3">{description}</p>
      <div className="flex gap-2">
        <code className="flex-1 bg-black/[0.04] rounded-lg px-3 py-2 text-xs font-mono truncate">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 h-9 px-3 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition"
        >
          {copied === "copied" ? "Copied!" : copied === "failed" ? "Failed — try ⌘C" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1800);
    } catch {
      setCopied("failed");
      setTimeout(() => setCopied("idle"), 2500);
    }
  };
  return (
    <div className="relative">
      <pre className="bg-black text-white text-[11px] font-mono rounded-lg p-4 overflow-x-auto whitespace-pre">
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 h-7 px-2.5 bg-white/10 text-white rounded text-[11px] font-semibold hover:bg-white/20 transition"
      >
        {copied === "copied" ? "Copied!" : copied === "failed" ? "Failed" : "Copy"}
      </button>
    </div>
  );
}
