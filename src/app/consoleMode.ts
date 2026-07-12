export type ConsoleMode = 'integrated' | 'managed';

declare const __CONSOLE_MODE__: ConsoleMode | undefined;

const selectedMode = typeof __CONSOLE_MODE__ === 'string' ? __CONSOLE_MODE__ : 'integrated';

export const consoleMode: ConsoleMode = selectedMode === 'managed' ? 'managed' : 'integrated';
