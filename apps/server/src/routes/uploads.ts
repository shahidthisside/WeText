import type { FastifyPluginAsync } from 'fastify';
import sharp, { type OutputInfo } from 'sharp';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { config } from '../config.js';
import { newId } from '../lib/crypto.js';
import { badRequest } from '../lib/errors.js';

const PRESETS = {
  avatar: { width: 400, height: 400, fit: 'cover' as const },
  banner: { width: 1500, height: 500, fit: 'cover' as const },
  media: { width: 1600, height: 1600, fit: 'inside' as const },
};

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

const routes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post(
    '/',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = requireUser(req);
      const { kind } = z.object({ kind: z.enum(['avatar', 'banner', 'media']).default('media') }).parse(req.query);
      const file = await req.file();
      if (!file) throw badRequest('No file uploaded');
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
