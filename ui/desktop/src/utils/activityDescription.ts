import { Message, getToolRequests, getToolResponses } from '../types/message';

/**
 * Пока агент работает, индикатор показывал только «Василиса работает над этим…»,
 * и по нему нельзя было понять, идёт ли что-то на самом деле. Здесь мы находим
 * инструмент, который выполняется прямо сейчас (запрос есть, ответа ещё нет), и
 * превращаем его имя в понятную подпись.
 */

/** Имя инструмента вида `developer__shell` -> `shell`. */
function shortToolName(name: string): string {
  const parts = name.split('__');
  return parts[parts.length - 1] ?? name;
}

export type ActiveTool = {
  /** Имя инструмента без префикса расширения. */
  name: string;
  /** Над чем он работает: путь к файлу, команда, поисковый запрос. */
  target?: string;
};

/** Достаёт из аргументов вызова то, что понятно человеку. */
function extractTarget(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  for (const key of ['path', 'file_path', 'filename', 'command', 'query', 'pattern', 'url', 'uri']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      const [trimmed] = value.trim().split(/\r?\n/);
      return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
    }
  }
  return undefined;
}

/** Инструмент, который выполняется прямо сейчас: запрос есть, ответа ещё нет. */
export function findActiveTool(messages: Message[]): ActiveTool | null {
  const answered = new Set<string>();
  for (const message of messages) {
    for (const response of getToolResponses(message)) {
      answered.add(response.id);
    }
  }

  // Идём с конца: интересен последний незавершённый вызов.
  for (let i = messages.length - 1; i >= 0; i--) {
    const requests = getToolRequests(messages[i]);
    for (let j = requests.length - 1; j >= 0; j--) {
      const request = requests[j];
      if (answered.has(request.id)) {
        continue;
      }
      const data = request.toolCall as Record<string, unknown>;
      const call = (data?.status === 'success' ? data.value : data) as
        | { name?: string; arguments?: unknown }
        | undefined;
      if (call?.name) {
        return { name: shortToolName(call.name), target: extractTarget(call.arguments) };
      }
    }
  }

  return null;
}

/** Ключ сообщения для перевода; `null`, если инструмент неизвестен. */
export type ActivityKind =
  | 'shell'
  | 'editFile'
  | 'readFile'
  | 'search'
  | 'web'
  | 'code'
  | 'todo'
  | 'memory'
  | 'subagent'
  | 'generic';

export function describeToolActivity(toolName: string): ActivityKind {
  switch (toolName) {
    case 'shell':
    case 'bash':
      return 'shell';
    case 'text_editor':
    case 'create_file':
    case 'write':
    case 'edit':
      return 'editFile';
    case 'read':
    case 'view':
    case 'analyze':
      return 'readFile';
    case 'search':
    case 'glob':
    case 'grep':
      return 'search';
    case 'web_search':
    case 'web_scrape':
    case 'fetch':
    case 'computer_control':
    case 'screen_capture':
      return 'web';
    case 'execute_typescript':
    case 'list_functions':
    case 'get_function_details':
      return 'code';
    case 'todo':
    case 'todo_write':
    case 'todo_read':
      return 'todo';
    case 'remember_memory':
    case 'retrieve_memories':
      return 'memory';
    case 'delegate':
    case 'summon':
      return 'subagent';
    default:
      return 'generic';
  }
}
