import { createContext, runInContext } from "node:vm";

const TIMEOUT_MS = 2000;

/**
 * Выполняет код сценария в отдельном контексте без доступа к require и process.
 * Код пишет владелец админки — это такой же серверный код, как остальной,
 * поэтому ограничиваемся изоляцией контекста и жёстким таймаутом.
 */
export function runUserCode(
  code: string,
  scope: Record<string, unknown>,
): { vars?: Record<string, unknown>; error?: string } {
  const vars: Record<string, unknown> = {};
  const context = createContext({
    // Читаем данные человека и пишем новые переменные в vars.
    data: scope,
    vars,
    JSON,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    console: { log: () => {} },
  });

  try {
    runInContext(`"use strict";\n${code}`, context, { timeout: TIMEOUT_MS });
    return { vars };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
