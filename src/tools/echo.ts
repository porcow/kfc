import type { TaskTool } from '../domain.ts';

export const echoTool: TaskTool = {
  id: 'echo',
  async execute(context) {
    context.signal.throwIfAborted();
    const message = String(context.parameters.message ?? '');
    return {
      summary: `Echoed message: ${message}`,
      data: {
        echoed: message,
      },
    };
  },
};
