import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import sharp, { type OutputInfo } from 'sharp';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { newId } from '../lib/crypto.js';
import { badRequest } from '../lib/errors.js';

const PRESETS = {
  avatar: { width: 400, height: 400, fit: 'cover' as const },
  banner: { width: 1500, height: 500, fit: 'cover' as const },
  media: { width: 2048, height: 2048, fit: 'inside' as const },
};

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

const routes: FastifyPluginAsync = async (app) => {
  const { uploadDir } = app.ctx;

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
      let out: { data: Buffer; info: OutputInfo };
      try {
        // Animated GIF/WebP stays animated for post/message media.
        const animated = kind === 'media' && (file.mimetype === 'image/gif' || file.mimetype === 'image/webp');
        out = await sharp(buf, { animated, limitInputPixels: 50_000_000 })
          .rotate() // honour EXIF orientation, then strip metadata
          .resize({ ...preset, withoutEnlargement: preset.fit === 'inside' })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw badRequest('That image couldn’t be processed');
      }

      const dir = path.join(uploadDir, user.id);
      await fs.mkdir(dir, { recursive: true });
      const name = `${newId()}.webp`;
      await fs.writeFile(path.join(dir, name), out.data);
      const height = out.info.pageHeight ?? out.info.height;
      return reply.code(201).send({ url: `/uploads/${user.id}/${name}`, width: out.info.width, height });
    },
  );
};

export default routes;
