import { BotManager } from './bot-manager.ts';
import { defaultConfigPath } from './config/paths.ts';
import { createAppServer } from './http/server.ts';

const configPath = defaultConfigPath();

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
