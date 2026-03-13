import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { BotManager } from '../bot-manager.ts';
import { createHealthServer } from '../feishu/sdk.ts';
import { LOCAL_RELOAD_PATH } from '../pairing.ts';

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function isLoopback(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export async function createAppServer(
  manager: BotManager,
  options: { startWebSockets?: boolean } = {},
): Promise<Server> {
  const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === manager.getConfig().server.healthPath) {
      const websocket = manager.getBotWebSocketHealth();
      sendJson(response, 200, {
        ok: true,
        loadedAt: manager.getConfig().loadedAt,
        bots: manager.listBotIds(),
        websocket,
        ready: Object.values(websocket).every((health) => health.state === 'connected'),
      });
      return;
    }

    if (path === LOCAL_RELOAD_PATH) {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      if (!isLoopback(request.socket.remoteAddress)) {
        sendJson(response, 403, { error: 'Local reload is only available from loopback' });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const botId = typeof body.botId === 'string' ? body.botId : '';
        if (!botId) {
          sendJson(response, 400, { error: 'botId is required' });
          return;
        }
        const result = await manager.reload(botId, 'local-admin');
        sendJson(response, 200, {
          ok: true,
          botCount: result.botCount,
        });
      } catch (error) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const route = manager.getRouteHandler(path);
    if (route) {
      route.handler(request, response);
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  };

  const server = createHealthServer((request, response) => {
    void requestHandler(request, response);
  });
  if (options.startWebSockets ?? true) {
    await manager.startWebSockets();
  }
  return server;
}
