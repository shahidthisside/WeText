import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import sharp, { type OutputInfo } from 'sharp';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { config } from '../config.js';
import type { DB } from '../db.js';
import { newId } from '../lib/crypto.js';
import { badRequest } from '../lib/errors.js';

const PRESETS = {
  avatar: { width: 400, height: 400, fit: 'cover' as const },
  banner: { width: 1500, height: 500, fit: 'cover' as const },
  media: { width: 1600, height: 1600, fit: 'inside' as const },
};

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

/** Max size for a stored voice note. */
const MAX_AUDIO_BYTES = Math.round(2.5 * 1024 * 1024);

/** Audio magic-byte sniffing. The client mime is not trusted. Returns the detected mime + file extension. */
export function sniffAudio(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  const ascii = (start: number, len: number) => buf.toString('latin1', start, start + len);
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' };
  // Ogg: "OggS"
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  // ISO base media (mp4/m4a): bytes 4..8 == "ftyp"
  if (ascii(4, 4) === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' };
  // WAV: "RIFF"...."WAVE"
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  // MP3: ID3 tag, or an MPEG audio frame sync (0xFF 0xEx/0xFx).
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: 'mp3' };
  return null;
}

const AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

/**
 * Serve a stored upload with correct content type, long-lived caching for images,
 * and HTTP Range support (206) for audio so iOS Safari can play voice notes.
 *
 * This is the implementation the public `/uploads/:uid/:name` route should use.
 * See the note in the stage report for the small change app.ts needs to call it.
 */
export async function serveUpload(db: DB, req: FastifyRequest, reply: FastifyReply, uid: string, name: string) {
  if (!/^[a-z0-9]+$/.test(uid) || !/^[a-zA-Z0-9_-]+\.(webp|gif|webm|ogg|m4a|mp3|wav)$/.test(name)) {
    return reply.code(404).send({ error: 'Not found', code: 'not_found' });
  }
  const row = (await db.prepare('SELECT mime, data FROM files WHERE path = ?').get(`${uid}/${name}`)) as
    | { mime: string; data: Buffer }
    | undefined;
  if (!row) return reply.code(404).send({ error: 'Not found', code: 'not_found' });
  const data = row.data;
  const total = data.length;
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  reply.header('accept-ranges', 'bytes');
  reply.type(row.mime);

  const range = req.headers.range;
  // Only honour a single byte range (which is all browsers send for media).
  const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] !== '' || match[2] !== '')) {
    let start = match[1] === '' ? total - Number(match[2]) : Number(match[1]);
    let end = match[2] === '' || match[1] === '' ? total - 1 : Number(match[2]);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || start >= total) {
      return reply.code(416).header('content-range', `bytes */${total}`).send();
    }
    if (end >= total) end = total - 1;
    const chunk = data.subarray(start, end + 1);
    return reply
      .code(206)
      .header('content-range', `bytes ${start}-${end}/${total}`)
      .header('content-length', chunk.length)
      .send(chunk);
  }
  return reply.header('content-length', total).send(data);
}

const routes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post(
    '/',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = requireUser(req);
      const { kind } = z.object({ kind: z.enum(['avatar', 'banner', 'media', 'audio']).default('media') }).parse(req.query);
      const file = await req.file();
      if (!file) throw badRequest('No file uploaded');

      if (kind === 'audio') {
        const buf = await file.toBuffer();
        if (buf.length > MAX_AUDIO_BYTES) throw badRequest('That audio clip is too large (max 2.5 MB)', 'too_large');
        const sniffed = sniffAudio(buf);
        if (!sniffed || !AUDIO_MIME.has(sniffed.mime)) throw badRequest('Only audio clips are supported (WebM, Ogg, MP4, MP3, WAV)');
        const used = (await db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) FROM files WHERE user_id = ?').pluck().get(user.id)) as number;
        if (used + buf.length > config.photoQuotaBytes) {
          throw badRequest('You’ve used up your storage. Delete some files to upload more.', 'storage_full');
        }
        const name = `${newId()}.${sniffed.ext}`;
        await db
          .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(`${user.id}/${name}`, user.id, sniffed.mime, buf, Date.now());
        return reply.code(201).send({ url: `/uploads/${user.id}/${name}` });
      }

      if (!ACCEPTED.has(file.mimetype)) throw badRequest('Only images are supported (JPG, PNG, WebP, GIF, AVIF)');
      const buf = await file.toBuffer();

      const preset = PRESETS[kind];
      let out: { data: Buffer; info: OutputInfo } | undefined;
      try {
        // Animated GIF/WebP stays animated for post/message media.
        const animated = kind === 'media' && (file.mimetype === 'image/gif' || file.mimetype === 'image/webp');
        // Try progressively stronger compression until the result fits the stored-size limit.
        for (const quality of [80, 62, 45]) {
          out = await sharp(buf, { animated, limitInputPixels: 50_000_000 })
            .rotate() // honour EXIF orientation, then strip metadata
            .resize({ ...preset, withoutEnlargement: preset.fit === 'inside' })
            .webp({ quality })
            .toBuffer({ resolveWithObject: true });
          if (out.data.length <= config.maxStoredPhotoBytes) break;
        }
      } catch {
        throw badRequest('That image couldn’t be processed');
      }
      if (!out || out.data.length > config.maxStoredPhotoBytes) throw badRequest('That image is too large. Try a smaller one.', 'too_large');

      const used = (await db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) FROM files WHERE user_id = ?').pluck().get(user.id)) as number;
      if (used + out.data.length > config.photoQuotaBytes) throw badRequest('You’ve used up your photo storage. Delete some photos to upload more.', 'storage_full');

      const name = `${newId()}.webp`;
      await db
        .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(`${user.id}/${name}`, user.id, 'image/webp', out.data, Date.now());
      const height = out.info.pageHeight ?? out.info.height;
      return reply.code(201).send({ url: `/uploads/${user.id}/${name}`, width: out.info.width, height });
    },
  );
};

export default routes;
