import type { CardResponse, CronJobRecord, ParameterDefinition, RunRecord, TaskDefinition } from '../domain.ts';

const FEISHU_SUMMARY_LIMIT = 300;

function baseCard(title: string, content: unknown[]): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: title,
      },
    },
    elements: content,
  };
}

function buildMarkdown(content: string): Record<string, unknown> {
  return {
    tag: 'markdown',
    content,
  };
}

function truncateSummary(summary: string): string {
  if (summary.length <= FEISHU_SUMMARY_LIMIT) {
    return summary;
  }
  return `${summary.slice(0, FEISHU_SUMMARY_LIMIT - 3)}...`;
}

function normalizeSummary(run: RunRecord): string {
  if (run.statusSummary?.trim()) {
    return truncateSummary(run.statusSummary.trim());
  }
  if (run.resultJson) {
    try {
      const parsed = JSON.parse(run.resultJson) as { summary?: unknown; error?: unknown };
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        return truncateSummary(parsed.summary.trim());
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return truncateSummary(parsed.error.trim());
      }
    } catch {
      return truncateSummary(run.resultJson);
    }
  }
  return 'n/a';
}

function buildButton(
  label: string,
  value: Record<string, unknown>,
  type: 'default' | 'primary' | 'danger' = 'default',
): Record<string, unknown> {
  return {
    tag: 'button',
    type,
    text: {
      tag: 'plain_text',
      content: label,
    },
    value,
  };
}

function buildActionRow(actions: Record<string, unknown>[]): Record<string, unknown> {
  return {
    tag: 'action',
    actions,
  };
}

function quoteExampleValue(value: string): string {
  return JSON.stringify(value);
}

function formatParameterDefinition(name: string, definition: ParameterDefinition): string {
  const flags = [definition.type, definition.required ? 'required' : 'optional'];
  if (definition.defaultValue !== undefined) {
    flags.push(`default=${String(definition.defaultValue)}`);
  }
  const description = definition.description ? ` - ${definition.description}` : '';
  return `- \`${name}\` (${flags.join(', ')})${description}`;
}

function buildExampleValue(name: string, definition: ParameterDefinition): string {
  switch (definition.type) {
    case 'string':
      return `${name}=${quoteExampleValue(`example-${name}`)}`;
    case 'number':
      return `${name}=1`;
    case 'boolean':
      return `${name}=true`;
    default:
      return `${name}=value`;
  }
}

function buildExampleCommand(task: TaskDefinition): string {
  const parameters = Object.entries(task.parameters).map(([name, definition]) =>
    buildExampleValue(name, definition),
  );
  return ['/run', task.id, ...parameters].join(' ');
}

function formatTaskDetails(task: TaskDefinition): string {
  const parameterLines = Object.entries(task.parameters).map(([name, definition]) =>
    formatParameterDefinition(name, definition),
  );
  const parameters =
    parameterLines.length > 0 ? parameterLines.join('\n') : '- No parameters required';
  return (
    `**${task.id}**\n${task.description}\nRunner: ${task.runnerKind}\nMode: ${task.executionMode}\nParameters:\n${parameters}\n` +
    `Example:\n\`${buildExampleCommand(task)}\``
  );
}

export function buildErrorCard(message: string): CardResponse {
  return {
    type: 'error',
    card: baseCard('Request failed', [buildMarkdown(message)]),
  };
}

export function buildAuthorizationCard(botId: string, pairCode: string): CardResponse {
  return {
    type: 'error',
    card: baseCard('Authorization required', [
      buildMarkdown(
        `You are not authorized for bot **${botId}**.\nAsk a local administrator to run:\n\`kfc pair ${pairCode}\``,
      ),
    ]),
  };
}

export function buildTaskListCard(tasks: TaskDefinition[]): CardResponse {
  return {
    type: 'card',
    card: baseCard(
      'Available tasks',
      tasks.filter((task) => task.executionMode === 'oneshot').map((task) => buildMarkdown(formatTaskDetails(task))),
    ),
  };
}

function formatCronListDetails(
  task: TaskDefinition,
  record?: CronJobRecord,
  subscribed = false,
): string {
  const runtimeState =
    record?.observedState === 'running'
      ? 'running'
      : record?.observedState === 'stopped'
        ? 'stopped'
        : 'unknown';
  return (
    `**${task.id}**\n${task.description}\nRunner: ${task.runnerKind}\nSchedule: \`${task.cron?.schedule ?? 'n/a'}\`\n` +
    `Auto start: **${task.cron?.autoStart ? 'true' : 'false'}**\nSubscribed: **${subscribed ? 'true' : 'false'}**\nState: **${runtimeState}**`
  );
}

export function buildCronTaskListCard(
  tasks: TaskDefinition[],
  records: Record<string, CronJobRecord>,
  currentChatSubscriptions: Record<string, boolean> = {},
  title = 'Cron tasks',
): CardResponse {
  return {
    type: 'card',
    card: baseCard(
      title,
      tasks
        .filter((task) => task.executionMode === 'cronjob')
        .map((task) =>
          buildMarkdown(
            formatCronListDetails(task, records[task.id], currentChatSubscriptions[task.id] ?? false),
          ),
        ),
    ),
  };
}

function formatCronStatusDetails(task: TaskDefinition, record?: CronJobRecord): string {
  const observedState = record?.observedState ?? 'unknown';
  return (
    `**${task.id}**\n${task.description}\nRunner: ${task.runnerKind}\nSchedule: \`${task.cron?.schedule ?? 'n/a'}\`\n` +
    `Observed: **${observedState}**`
  );
}

export function buildCronStatusCard(
  tasks: TaskDefinition[],
  records: Record<string, CronJobRecord>,
): CardResponse {
  return {
    type: 'card',
    card: baseCard(
      'Cron status',
      tasks
        .filter((task) => task.executionMode === 'cronjob')
        .map((task) => buildMarkdown(formatCronStatusDetails(task, records[task.id]))),
    ),
  };
}

export function buildHelpCard(): CardResponse {
  return {
    type: 'card',
    card: baseCard('Available commands', [
      buildMarkdown(
        [
          '`/tasks`',
          'List available tasks and their example `/run` commands.',
          '',
          '`/run TASK_ID key=value ...`',
          'Validate parameters and return a confirmation card before execution.',
          '',
          '`/cron list`',
          'List configured cronjob tasks for this bot.',
          '',
          '`/cron start TASK_ID`',
          'Subscribe this chat and start a configured cronjob task if needed.',
          '',
          '`/cron stop TASK_ID`',
          'Stop a configured cronjob task globally and clear all subscriptions.',
          '',
          '`/cron status`',
          'Show current cronjob observed runtime state.',
          '',
          '`/run-status RUN_ID`',
          'Show the latest persisted state and result summary for a run.',
          '',
          '`/cancel RUN_ID`',
          'Request cancellation for a running cancellable task.',
          '',
          '`/reload`',
          'Reload bot configuration from local TOML.',
          '',
          'Use `/tasks` to see task-specific example commands.',
        ].join('\n'),
      ),
    ]),
  };
}

export function buildConfirmationCard(
  task: TaskDefinition,
  parameters: Record<string, string | number | boolean>,
  confirmationId: string,
): CardResponse {
  const parameterSummary =
    Object.keys(parameters).length === 0 ? 'No parameters' : `\`${JSON.stringify(parameters)}\``;
  return {
    type: 'card',
    card: baseCard('Confirm task run', [
      buildMarkdown(
        `Task: **${task.id}**\nConfirmation: \`${confirmationId}\`\nParameters: ${parameterSummary}`,
      ),
      buildActionRow([
        buildButton(
          'Confirm',
          {
            type: 'confirm_task',
            confirmationId,
          },
          'primary',
        ),
        buildButton('Cancel', {
          type: 'cancel_confirmation',
          confirmationId,
        }),
      ]),
    ]),
  };
}

export function buildCancellationCard(message: string): CardResponse {
  return {
    type: 'card',
    card: baseCard('Request cancelled', [buildMarkdown(message)]),
  };
}

export function buildRunStatusCard(run: RunRecord): CardResponse {
  return {
    type: 'card',
    card: baseCard(`Run ${run.runId}`, [
      buildMarkdown(
        `Run ID: \`${run.runId}\`\n` +
          `Task: **${run.taskId}**\n` +
          `State: **${run.state}**\n` +
          `Actor: \`${run.actorId}\`\n` +
          `Started At: ${run.startedAt ?? 'n/a'}\n` +
          `Finished At: ${run.finishedAt ?? 'n/a'}\n` +
          `Summary: ${normalizeSummary(run)}`,
      ),
    ]),
  };
}
