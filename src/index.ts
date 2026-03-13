import { resolve } from 'node:path';

import { BotManager } from './bot-manager.ts';
import { createAppServer } from './http/server.ts';

const configPath = resolve(process.env.KIDS_ALFRED_CONFIG ?? './config/example.bot.toml');

const manager = await BotManager.create(configPath);
const server = await createAppServer(manager);
server.listen(manager.getConfig().server.port, () => {
  process.stdout.write(
    `Kids Alfred listening on port ${manager.getConfig().server.port} using ${configPath}\n`,
  );
});

process.on('SIGINT', () => {
  server.close(() => {
    void manager.close().finally(() => {
      process.exit(0);
    });
  });
});
