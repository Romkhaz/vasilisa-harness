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

/** Идентификаторы сообщений: ключ — id вызова, значение — имя инструмента. */
export function findActiveToolName(messages: Message[]): string | null {
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
        | { name?: string }
        | undefined;
      if (call?.name) {
        return shortToolName(call.name);
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
