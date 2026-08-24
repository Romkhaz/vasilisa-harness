import GooseLogo from './GooseLogo';
import AnimatedIcons from './AnimatedIcons';
import FlyingBird from './FlyingBird';
import { ChatState } from '../types/chatState';
import { ActivityKind, describeToolActivity } from '../utils/activityDescription';
import { defineMessages, useIntl } from '../i18n';

interface LoadingGooseProps {
  /** Инструмент, который выполняется прямо сейчас (без префикса расширения). */
  activeTool?: string | null;
  message?: string;
  chatState?: ChatState;
}

const i18n = defineMessages({
  loadingConversation: {
    id: 'loadingGoose.loadingConversation',
    defaultMessage: 'loading conversation...',
  },
  thinking: {
    id: 'loadingGoose.thinking',
    defaultMessage: 'Vasilisa is thinking…',
  },
  streaming: {
    id: 'loadingGoose.streaming',
    defaultMessage: 'Vasilisa is working on it…',
  },
  waiting: {
    id: 'loadingGoose.waiting',
    defaultMessage: 'Vasilisa is waiting…',
  },
  compacting: {
    id: 'loadingGoose.compacting',
    defaultMessage: 'Vasilisa is compacting the conversation...',
  },
  idle: {
    id: 'loadingGoose.idle',
    defaultMessage: 'Vasilisa is working on it…',
  },
  activityShell: {
    id: 'loadingGoose.activityShell',
    defaultMessage: 'Vasilisa is running a command…',
  },
  activityEditFile: {
    id: 'loadingGoose.activityEditFile',
    defaultMessage: 'Vasilisa is editing a file…',
  },
  activityReadFile: {
    id: 'loadingGoose.activityReadFile',
    defaultMessage: 'Vasilisa is reading files…',
  },
  activitySearch: {
    id: 'loadingGoose.activitySearch',
    defaultMessage: 'Vasilisa is searching the project…',
  },
  activityWeb: {
    id: 'loadingGoose.activityWeb',
    defaultMessage: 'Vasilisa is working with an external source…',
  },
  activityCode: {
    id: 'loadingGoose.activityCode',
    defaultMessage: 'Vasilisa is executing code…',
  },
  activityTodo: {
    id: 'loadingGoose.activityTodo',
    defaultMessage: 'Vasilisa is updating the task list…',
  },
  activityMemory: {
    id: 'loadingGoose.activityMemory',
    defaultMessage: 'Vasilisa is working with memory…',
  },
  activitySubagent: {
    id: 'loadingGoose.activitySubagent',
    defaultMessage: 'Vasilisa delegated a subtask…',
  },
  activityGeneric: {
    id: 'loadingGoose.activityGeneric',
    defaultMessage: 'Vasilisa is calling {tool}…',
  },
  restartingAgent: {
    id: 'loadingGoose.restartingAgent',
    defaultMessage: 'restarting session...',
  },
});

const STATE_ICONS: Record<ChatState, React.ReactNode> = {
  [ChatState.LoadingConversation]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Thinking]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Streaming]: <FlyingBird className="flex-shrink-0" cycleInterval={150} />,
  [ChatState.WaitingForUserInput]: (
    <AnimatedIcons className="flex-shrink-0" cycleInterval={600} variant="waiting" />
  ),
  [ChatState.Compacting]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Idle]: <GooseLogo size="small" hover={false} />,
  [ChatState.RestartingAgent]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
};

const STATE_MESSAGE_KEYS: Record<ChatState, keyof typeof i18n> = {
  [ChatState.LoadingConversation]: 'loadingConversation',
  [ChatState.Thinking]: 'thinking',
  [ChatState.Streaming]: 'streaming',
  [ChatState.WaitingForUserInput]: 'waiting',
  [ChatState.Compacting]: 'compacting',
  [ChatState.Idle]: 'idle',
  [ChatState.RestartingAgent]: 'restartingAgent',
};

const ACTIVITY_MESSAGE_KEYS: Record<ActivityKind, keyof typeof i18n> = {
  shell: 'activityShell',
  editFile: 'activityEditFile',
  readFile: 'activityReadFile',
  search: 'activitySearch',
  web: 'activityWeb',
  code: 'activityCode',
  todo: 'activityTodo',
  memory: 'activityMemory',
  subagent: 'activitySubagent',
  generic: 'activityGeneric',
};

const LoadingGoose = ({ message, chatState = ChatState.Idle, activeTool }: LoadingGooseProps) => {
  const intl = useIntl();
  // Приоритет: сообщение о ходе работы от сервера, затем текущий инструмент, затем
  // общая подпись состояния.
  const activityMessage = activeTool
    ? intl.formatMessage(i18n[ACTIVITY_MESSAGE_KEYS[describeToolActivity(activeTool)]], {
        tool: activeTool,
      })
    : null;
  const displayMessage =
    message || activityMessage || intl.formatMessage(i18n[STATE_MESSAGE_KEYS[chatState]]);
  const icon = STATE_ICONS[chatState];

  return (
    <div className="w-full animate-fade-slide-up">
      <div
        data-testid="loading-indicator"
        className="flex items-center gap-2 text-xs text-text-primary py-2"
      >
        {icon}
        {displayMessage}
      </div>
    </div>
  );
};

export default LoadingGoose;
