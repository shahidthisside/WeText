import { buildApp } from './app.js';
import { config } from './config.js';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`WeText API listening on http://${config.host}:${config.port}`);
  if (config.isProd && !config.publicUrl) console.warn('[config] PUBLIC_URL is not set: emailed links (password reset) will point at the wrong address.');
  if (config.isProd && !(config.brevoApiKey && config.mailFrom)) console.warn('[config] BREVO_API_KEY / MAIL_FROM are not set: password-reset emails will not be sent.');
} catch (err) {
  console.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
