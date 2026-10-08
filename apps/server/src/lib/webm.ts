/**
 * Repairs voice notes recorded in a browser (WebM / Opus).
 *
 * Browsers write these files without a length, and some phones occasionally stamp one audio packet at 0 s and
 * then jump the clock ahead (for example the real sound starts at 29 s). The player then believes the clip is
 * 32 seconds long, shows "0:32" and plays through 29 seconds of nothing in an instant.
 *
 * `repairWebm` closes such a gap by moving the timestamps of the clusters after it back, and writes the real length
 * into the file. It only ever changes a file when it finds a clear jump, and it returns the original bytes
 * untouched on anything it does not fully understand, so a healthy or unfamiliar file can never be damaged.
 */

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_CLUSTER = 0x1f43b675;
const ID_TIMECODE = 0xe7;
const ID_SIMPLEBLOCK = 0xa3;
const ID_BLOCKGROUP = 0xa0;
const ID_BLOCK = 0xa1;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

/** Elements that can follow a cluster at the top level of the segment (they end an open-ended cluster). */
const TOP_LEVEL = new Set([ID_CLUSTER, ID_INFO, 0x1654ae6b, 0x1c53bb6b, 0x1254c367, 0x114d9b74, 0x1941a469]);

/** A gap this long between two packets is treated as a broken clock, not as silence. */
const GAP_LIMIT_MS = 1500;
/** Never repair into something absurdly long. */
const MAX_REASONABLE_MS = 15 * 60_000;

interface Vint {
  value: number;
  len: number;
  unknown: boolean;
}

function readId(b: Buffer, i: number): { id: number; len: number } | null {
  if (i >= b.length) return null;
  const first = b[i]!;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 4 || i + len > b.length) return null;
  let id = 0;
  for (let k = 0; k < len; k++) id = id * 256 + b[i + k]!;
  return { id, len };
}

function readSize(b: Buffer, i: number): Vint | null {
  if (i >= b.length) return null;
  const first = b[i]!;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || i + len > b.length) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let k = 1; k < len; k++) {
    const byte = b[i + k]!;
    if (byte !== 0xff) allOnes = false;
    value = value * 256 + byte;
  }
  return { value, len, unknown: allOnes };
}

interface ClusterInfo {
  /** Byte offset of the cluster timecode's value, and its width. */
  tcPos: number;
  tcLen: number;
  tc: number;
  /** Block timestamps relative to the cluster. */
  rels: number[];
}

export interface WebmRepairResult {
  data: Buffer;
  repaired: boolean;
}

/** Returns the repaired bytes, or the very same Buffer if nothing needed (or nothing could safely be) changed. */
export function repairWebm(input: Buffer): Buffer {
  return repairWebmDetailed(input).data;
}

export function repairWebmDetailed(input: Buffer): WebmRepairResult {
  const same: WebmRepairResult = { data: input, repaired: false };
  try {
    return doRepair(input) ?? same;
  } catch {
    return same;
  }
}

function doRepair(b: Buffer): WebmRepairResult | null {
  // --- EBML header, then the segment
  const head = readId(b, 0);
  if (!head || head.id !== ID_EBML) return null;
  const headSize = readSize(b, head.len);
  if (!headSize || headSize.unknown) return null;
  let i = head.len + headSize.len + headSize.value;
  const seg = readId(b, i);
  if (!seg || seg.id !== ID_SEGMENT) return null;
  const segSize = readSize(b, i + seg.len);
  if (!segSize) return null;
  const segDataStart = i + seg.len + segSize.len;
  const segEnd = segSize.unknown ? b.length : Math.min(b.length, segDataStart + segSize.value);

  // --- walk the segment's children
  let infoPos = -1;
  let infoSizeLen = 0;
  let infoSize = 0;
  let timecodeScale = 1_000_000;
  let hasDuration = false;
  const clusters: ClusterInfo[] = [];

  i = segDataStart;
  while (i < segEnd) {
    const el = readId(b, i);
    if (!el) break;
    const sz = readSize(b, i + el.len);
    if (!sz) break;
    const dataStart = i + el.len + sz.len;
    if (el.id === ID_INFO) {
      if (sz.unknown) return null;
      infoPos = i;
      infoSizeLen = sz.len;
      infoSize = sz.value;
      // scan the info children for the timecode scale and an existing duration
      let j = dataStart;
      const infoEnd = dataStart + sz.value;
      while (j < infoEnd) {
        const c = readId(b, j);
        if (!c) break;
        const cs = readSize(b, j + c.len);
        if (!cs || cs.unknown) break;
        const cData = j + c.len + cs.len;
        if (c.id === ID_TIMECODE_SCALE) {
          let v = 0;
          for (let k = 0; k < cs.value; k++) v = v * 256 + b[cData + k]!;
          if (v > 0) timecodeScale = v;
        }
        if (c.id === ID_DURATION) hasDuration = true;
        j = cData + cs.value;
      }
      i = dataStart + sz.value;
    } else if (el.id === ID_CLUSTER) {
      const end = sz.unknown ? b.length : Math.min(b.length, dataStart + sz.value);
      const cl: ClusterInfo = { tcPos: -1, tcLen: 0, tc: 0, rels: [] };
      let j = dataStart;
      while (j < end) {
        const c = readId(b, j);
        if (!c) break;
        if (sz.unknown && TOP_LEVEL.has(c.id)) break;
        const cs = readSize(b, j + c.len);
        if (!cs || cs.unknown) return null;
        const cData = j + c.len + cs.len;
        if (c.id === ID_TIMECODE) {
          if (cs.value < 1 || cs.value > 6) return null;
          let v = 0;
          for (let k = 0; k < cs.value; k++) v = v * 256 + b[cData + k]!;
          cl.tcPos = cData;
          cl.tcLen = cs.value;
          cl.tc = v;
        } else if (c.id === ID_SIMPLEBLOCK || c.id === ID_BLOCK) {
          const rel = blockRel(b, cData, cs.value);
          if (rel === null) return null;
          cl.rels.push(rel);
        } else if (c.id === ID_BLOCKGROUP) {
          // a block group wraps one Block
          let m = cData;
          const gEnd = cData + cs.value;
          while (m < gEnd) {
            const g = readId(b, m);
            if (!g) break;
            const gs = readSize(b, m + g.len);
            if (!gs || gs.unknown) break;
            const gData = m + g.len + gs.len;
            if (g.id === ID_BLOCK) {
              const rel = blockRel(b, gData, gs.value);
              if (rel === null) return null;
              cl.rels.push(rel);
            }
            m = gData + gs.value;
          }
        }
        j = cData + cs.value;
      }
      if (cl.tcPos < 0) return null; // a cluster without a timecode: not something we understand
      clusters.push(cl);
      i = j;
    } else {
      if (sz.unknown) break;
      i = dataStart + sz.value;
    }
  }

  const withBlocks = clusters.filter((c) => c.rels.length > 0);
  if (withBlocks.length < 2) return null;

  // --- typical spacing between packets (an Opus frame), used to place the first packet after a gap
  const deltas: number[] = [];
  for (const c of withBlocks) for (let k = 1; k < c.rels.length; k++) deltas.push(c.rels[k]! - c.rels[k - 1]!);
  deltas.sort((x, y) => x - y);
  const positive = deltas.filter((d) => d > 0 && d < 200);
  const step = positive.length ? positive[Math.floor(positive.length / 2)]! : 20;

  // --- find forward jumps between clusters and work out how far each cluster must move back
  let shift = 0;
  let prevLast: number | null = null;
  let lastAbs = 0;
  const newTcs: { cl: ClusterInfo; tc: number }[] = [];
  let changed = false;
  for (const c of withBlocks) {
    const first = c.tc + Math.min(...c.rels) - shift;
    if (prevLast !== null) {
      const gap = first - (prevLast + step);
      if (gap > GAP_LIMIT_MS) {
        shift += gap;
        changed = true;
      } else if (gap < -GAP_LIMIT_MS) {
        return null; // timestamps going backwards: leave the file alone
      }
    }
    const tc = c.tc - shift;
    if (tc < 0) return null;
    newTcs.push({ cl: c, tc });
    prevLast = tc + Math.max(...c.rels);
    lastAbs = prevLast;
  }
  if (!changed) return null;
  const durationMs = lastAbs + step;
  if (!(durationMs > 0) || durationMs > MAX_REASONABLE_MS) return null;

  // --- write the new cluster timecodes in place (same width, so no sizes change)
  const out = Buffer.from(b);
  for (const { cl, tc } of newTcs) {
    if (tc >= 2 ** (8 * cl.tcLen)) return null;
    let v = tc;
    for (let k = cl.tcLen - 1; k >= 0; k--) {
      out[cl.tcPos + k] = v % 256;
      v = Math.floor(v / 256);
    }
  }

  // --- add the real length to the segment info (only when the segment has an open-ended size, so no parent size changes)
  if (!hasDuration && infoPos >= 0 && segSize.unknown && infoSizeLen === 1 && infoSize + 11 < 127) {
    const dur = Buffer.alloc(11);
    dur[0] = 0x44;
    dur[1] = 0x89;
    dur[2] = 0x88; // 8-byte float
    dur.writeDoubleBE((durationMs * 1_000_000) / timecodeScale, 3);
    const infoDataStart = infoPos + 1 + 3 + infoSizeLen; // id is 4 bytes
    const infoEnd = infoDataStart + infoSize;
    const rebuilt = Buffer.concat([out.subarray(0, infoPos + 4), Buffer.from([0x80 | (infoSize + 11)]), out.subarray(infoDataStart, infoEnd), dur, out.subarray(infoEnd)]);
    return { data: rebuilt, repaired: true };
  }
  return { data: out, repaired: true };
}

/** The relative timestamp stored in a (Simple)Block: a track number (variable width) then a signed 16-bit offset. */
function blockRel(b: Buffer, start: number, size: number): number | null {
  const tn = readSize(b, start);
  if (!tn || tn.len + 2 > size) return null;
  const p = start + tn.len;
  if (p + 2 > b.length) return null;
  return b.readInt16BE(p);
}
