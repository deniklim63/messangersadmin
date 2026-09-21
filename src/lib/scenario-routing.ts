/** Чистая логика переходов по сценарию — без обращений к базе и платформам. */

const START_COMMANDS = ["/start", "start", "начать", "старт", "меню", "/menu"];

export type RoutingBlock = {
  id: string;
  isStart: boolean;
  keywords: string[];
  buttons: { label: string; targetBlockId: string | null }[];
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Куда ведёт то, что написал человек: кнопка экрана, ключевое слово или старт. */
export function resolveTarget<T extends RoutingBlock>(
  blocks: T[],
  currentBlockId: string | null,
  text: string,
): T | null {
  const needle = normalize(text);
  const startBlock = blocks.find((block) => block.isStart) ?? blocks[0] ?? null;
  const current = blocks.find((block) => block.id === currentBlockId) ?? null;

  if (!needle) return current ? null : startBlock;

  return (
    resolveExplicit(blocks, current, needle, startBlock) ??
    // 5. Не поняли: новичку показываем начало, остальным — повторяем текущий экран.
    current ??
    startBlock
  );
}

/**
 * Только осознанные переходы — кнопка, ключевое слово или команда старта.
 * Свободный текст сюда не попадает: возвращает null.
 */
export function resolveExplicitTarget<T extends RoutingBlock>(
  blocks: T[],
  currentBlockId: string | null,
  text: string,
): T | null {
  const needle = normalize(text);
  if (!needle) return null;
  const startBlock = blocks.find((block) => block.isStart) ?? blocks[0] ?? null;
  const current = blocks.find((block) => block.id === currentBlockId) ?? null;
  return resolveExplicit(blocks, current, needle, startBlock);
}

function resolveExplicit<T extends RoutingBlock>(
  blocks: T[],
  current: T | null,
  needle: string,
  startBlock: T | null,
): T | null {

  // 1. Нажали кнопку текущего экрана.
  const pressed = current?.buttons.find((button) => normalize(button.label) === needle);
  if (pressed?.targetBlockId) {
    return blocks.find((block) => block.id === pressed.targetBlockId) ?? null;
  }

  // 2. Кнопка другого экрана — человек мог нажать оставшуюся на экране клавиатуру.
  for (const block of blocks) {
    const button = block.buttons.find((item) => normalize(item.label) === needle);
    if (button?.targetBlockId) {
      return blocks.find((item) => item.id === button.targetBlockId) ?? null;
    }
  }

  // 3. Ключевое слово экрана.
  const byKeyword = blocks.find((block) =>
    block.keywords.some((keyword) => normalize(keyword) === needle),
  );
  if (byKeyword) return byKeyword;

  // 4. Команда начала диалога.
  if (START_COMMANDS.includes(needle)) return startBlock;

  return null;
}
