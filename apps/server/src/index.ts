import { buildApp } from './app.js';

async function main() {
  const { app, dbCtx, config } = await buildApp();

  const shutdown = async () => {
    await app.close();
    await dbCtx.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
