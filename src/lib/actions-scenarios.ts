"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateRule, OPERATOR_LABELS, type ConditionOperator } from "@/lib/conditions";
import { runUserCode } from "@/lib/run-code";
import { runRequest } from "@/lib/run-request";
import { buildScope } from "@/lib/template";

type State = { error?: string; ok?: string };

/**
 * Заголовки принимаем и построчно «Ключ: значение», и целым JSON —
 * из других конструкторов их обычно копируют именно объектом.
 */
function parseHeaders(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key.trim(), String(value)]),
      );
    } catch {
      // не разобрался как JSON — читаем построчно
    }
  }

  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key) headers[key] = line.slice(separator + 1).trim();
  }
  return headers;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function createScenario(_state: State, formData: FormData): Promise<State> {
  await requireAuth();
  const botId = String(formData.get("botId") ?? "");
  const title = String(formData.get("title") ?? "").trim() || "Новый сценарий";
  if (!botId) return { error: "Выберите бота" };

  const scenario = await prisma.scenario.create({
    data: {
      botId,
      title,
      blocks: {
        create: {
          title: "Приветствие",
          text: "Привет! Это стартовое сообщение — замените его на своё.",
          isStart: true,
        },
      },
    },
  });

  revalidatePath("/scenarios");
  redirect(`/scenarios/${scenario.id}`);
}

export async function toggleScenario(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) return;

  // Активным может быть только один сценарий бота, иначе бот раздвоится.
  if (!scenario.isActive) {
    await prisma.scenario.updateMany({
      where: { botId: scenario.botId, isActive: true },
      data: { isActive: false },
    });
  }

  await prisma.scenario.update({
    where: { id },
    data: { isActive: !scenario.isActive },
  });

  revalidatePath("/scenarios");
  revalidatePath(`/scenarios/${id}`);
}

export async function deleteScenario(formData: FormData) {
  await requireAuth();
  await prisma.scenario.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/scenarios");
  redirect("/scenarios");
}

export async function createBlock(formData: FormData) {
  await requireAuth();
  const scenarioId = String(formData.get("scenarioId"));
  const block = await prisma.scenarioBlock.create({
    data: {
      scenarioId,
      title: String(formData.get("title") ?? "").trim() || "Новый экран",
      text: "Текст сообщения",
    },
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  redirect(`/scenarios/${scenarioId}?block=${block.id}`);
}

export async function deleteBlock(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const block = await prisma.scenarioBlock.findUnique({ where: { id } });
  if (!block) return;
  await prisma.scenarioBlock.delete({ where: { id } });
  revalidatePath(`/scenarios/${block.scenarioId}`);
  redirect(`/scenarios/${block.scenarioId}`);
}

export async function updateBlock(_state: State, formData: FormData): Promise<State> {
  await requireAuth();
  const id = String(formData.get("id"));
  const block = await prisma.scenarioBlock.findUnique({ where: { id } });
  if (!block) return { error: "Экран не найден" };

  const text = String(formData.get("text") ?? "").trim();
  const isMessage = String(formData.get("kind") ?? "MESSAGE") === "MESSAGE";
  if (isMessage && !text) return { error: "Текст сообщения не может быть пустым" };

  // Картинка
  let imageId: string | null | undefined;
  if (formData.get("removeImage") === "on") imageId = null;

  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { error: "Нужен файл-картинка" };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Картинка больше 5 МБ" };
    const created = await prisma.mediaFile.create({
      data: {
        filename: file.name,
        mime: file.type,
        size: file.size,
        data: Buffer.from(await file.arrayBuffer()),
      },
    });
    imageId = created.id;
  }

  const isStart = formData.get("isStart") === "on";
  if (isStart) {
    await prisma.scenarioBlock.updateMany({
      where: { scenarioId: block.scenarioId, isStart: true },
      data: { isStart: false },
    });
  }

  const kind = String(formData.get("kind") ?? "MESSAGE") as
    | "MESSAGE"
    | "REQUEST"
    | "CODE"
    | "CONDITION"
    | "DELAY"
    | "HANDOFF";

  // Правила условия приходят параллельными списками полей.
  const fields = formData.getAll("conditionField").map(String);
  const operators = formData.getAll("conditionOperator").map(String);
  const values = formData.getAll("conditionValue").map(String);
  const targets = formData.getAll("conditionTarget").map(String);
  const conditions = fields
    .map((field, index) => ({
      field: field.trim(),
      operator: operators[index] ?? "eq",
      value: values[index] ?? "",
      targetBlockId: targets[index] || null,
    }))
    .filter((rule) => rule.field);

  const headers = parseHeaders(String(formData.get("headers") ?? ""));

  await prisma.scenarioBlock.update({
    where: { id },
    data: {
      kind,
      title: String(formData.get("title") ?? "").trim() || block.title,
      text,
      isStart,
      keywords: String(formData.get("keywords") ?? "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      method: String(formData.get("method") ?? "GET"),
      url: String(formData.get("url") ?? "").trim() || null,
      headers: Object.keys(headers).length ? headers : undefined,
      body: String(formData.get("body") ?? "").trim() || null,
      saveAs: String(formData.get("saveAs") ?? "").trim() || null,
      code: String(formData.get("code") ?? "").trim() || null,
      conditions: conditions.length ? conditions : undefined,
      delaySeconds: Number(formData.get("delaySeconds")) || null,
      inputKind: String(formData.get("inputKind") ?? "").trim() || null,
      inputError: String(formData.get("inputError") ?? "").trim() || null,
      listSource: String(formData.get("listSource") ?? "").trim() || null,
      listTemplate: String(formData.get("listTemplate") ?? "").trim() || null,
      listEmpty: String(formData.get("listEmpty") ?? "").trim() || null,
      listLimit: Number(formData.get("listLimit")) || null,
      nextBlockId: String(formData.get("nextBlockId") ?? "").trim() || null,
      ...(imageId === undefined ? {} : { imageId }),
    },
  });

  // Кнопки пересоздаём целиком — так проще, чем сверять по одной.
  const labels = formData.getAll("buttonLabel").map(String);
  const buttonTargets = formData.getAll("buttonTarget").map(String);
  const buttonUrls = formData.getAll("buttonUrl").map(String);

  await prisma.scenarioButton.deleteMany({ where: { blockId: id } });
  const buttons = labels
    .map((label, index) => ({
      label: label.trim(),
      target: buttonTargets[index] ?? "",
      url: (buttonUrls[index] ?? "").trim(),
    }))
    .filter((button) => button.label);

  if (buttons.length) {
    await prisma.scenarioButton.createMany({
      data: buttons.map((button, index) => ({
        blockId: id,
        label: button.label,
        position: index,
        targetBlockId: button.url ? null : button.target || null,
        url: button.url || null,
      })),
    });
  }

  revalidatePath(`/scenarios/${block.scenarioId}`);
  return { ok: "Сохранено" };
}

/** Сохраняет расположение блоков на схеме — вызывается после перетаскивания. */
export async function saveBlockPositions(
  scenarioId: string,
  positions: { id: string; x: number; y: number }[],
): Promise<void> {
  await requireAuth();
  if (positions.length === 0) return;

  await prisma.$transaction(
    positions.map((position) =>
      prisma.scenarioBlock.update({
        where: { id: position.id },
        data: { positionX: Math.round(position.x), positionY: Math.round(position.y) },
      }),
    ),
  );

  revalidatePath(`/scenarios/${scenarioId}`);
}

/** Новый экран прямо на схеме — в том месте, куда нажали. */
export async function createBlockAt(
  scenarioId: string,
  x: number,
  y: number,
): Promise<{ id: string }> {
  await requireAuth();
  const block = await prisma.scenarioBlock.create({
    data: {
      scenarioId,
      title: "Новый экран",
      text: "Текст сообщения",
      positionX: Math.round(x),
      positionY: Math.round(y),
    },
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  return { id: block.id };
}

/** Связывает кнопку с экраном — стрелку тянут прямо на схеме. */
export async function connectButton(buttonId: string, targetBlockId: string | null) {
  await requireAuth();
  const button = await prisma.scenarioButton.update({
    where: { id: buttonId },
    data: { targetBlockId },
    include: { block: true },
  });

  revalidatePath(`/scenarios/${button.block.scenarioId}`);
}

export type TestResult = { ok: boolean; output: string };

/** Пробный запуск блока прямо из редактора — с данными выбранного человека или пустыми. */
export async function testBlock(_state: TestResult, formData: FormData): Promise<TestResult> {
  await requireAuth();

  const kind = String(formData.get("kind") ?? "MESSAGE");
  const sample = await prisma.contact.findFirst({
    orderBy: { updatedAt: "desc" },
    include: { city: true },
  });

  const scope = buildScope({
    name: sample?.name,
    phone: sample?.phone,
    email: sample?.email,
    city: sample?.city?.name,
    variables: sample?.variables,
  });

  if (kind === "CODE") {
    const result = runUserCode(String(formData.get("code") ?? ""), scope);
    if (result.error) return { ok: false, output: result.error };
    return {
      ok: true,
      output: `Переменные: ${JSON.stringify(result.vars, null, 2)}`,
    };
  }

  if (kind === "CONDITION") {
    const fields = formData.getAll("conditionField").map(String);
    const operators = formData.getAll("conditionOperator").map(String);
    const values = formData.getAll("conditionValue").map(String);
    const targets = formData.getAll("conditionTarget").map(String);

    const titles = new Map(
      (await prisma.scenarioBlock.findMany({ select: { id: true, title: true } })).map((block) => [
        block.id,
        block.title,
      ]),
    );

    const lines: string[] = [];
    let matched = false;

    for (const [index, field] of fields.entries()) {
      if (!field.trim()) continue;
      const rule = {
        field: field.trim(),
        operator: (operators[index] ?? "eq") as ConditionOperator,
        value: values[index] ?? "",
      };
      const passed = evaluateRule(rule, scope);
      const target = targets[index] ? titles.get(targets[index]) : null;
      const mark = passed && !matched ? "→" : passed ? "✓" : "·";
      lines.push(
        `${mark} ${rule.field} ${OPERATOR_LABELS[rule.operator]} ${rule.value || ""} ${
          target ? `⇒ ${target}` : ""
        }`.trim(),
      );
      if (passed) matched = true;
    }

    if (lines.length === 0) return { ok: false, output: "Правил пока нет" };
    return {
      ok: true,
      output: [
        `Данные: город «${scope.city || "—"}», телефон «${scope.phone || "—"}»`,
        ...lines,
        matched ? "" : "Ни одно правило не подошло — пойдём по ветке «иначе»",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if (kind === "REQUEST") {
    const headers = parseHeaders(String(formData.get("headers") ?? ""));

    const result = await runRequest(
      {
        method: String(formData.get("method") ?? "GET"),
        url: String(formData.get("url") ?? ""),
        headers,
        body: String(formData.get("body") ?? ""),
      },
      scope,
    );

    if (result.error) return { ok: false, output: result.error };
    const preview =
      typeof result.data === "string"
        ? result.data.slice(0, 600)
        : JSON.stringify(result.data, null, 2).slice(0, 600);
    return { ok: result.ok, output: `HTTP ${result.status}\n${preview}` };
  }

  return { ok: false, output: "Проверять можно запрос или код" };
}

/** Переносит сценарий на другого бота — например, собрали на Telegram, включаем во ВКонтакте. */
export async function moveScenario(formData: FormData): Promise<void> {
  await requireAuth();
  const id = String(formData.get("id"));
  const botId = String(formData.get("botId"));
  if (!id || !botId) return;

  await prisma.scenario.update({ where: { id }, data: { botId, isActive: false } });
  revalidatePath(`/scenarios/${id}`);
  revalidatePath("/scenarios");
}

/**
 * Делает копию блока со всеми кнопками и настройками.
 * Ключевые слова и отметку стартового не копируем: они должны остаться уникальными.
 */
export async function duplicateBlock(blockId: string): Promise<{ id: string } | null> {
  await requireAuth();

  const source = await prisma.scenarioBlock.findUnique({
    where: { id: blockId },
    include: { buttons: { orderBy: { position: "asc" } } },
  });
  if (!source) return null;

  const copy = await prisma.scenarioBlock.create({
    data: {
      scenarioId: source.scenarioId,
      kind: source.kind,
      title: `${source.title} (копия)`,
      text: source.text,
      imageId: source.imageId,
      isStart: false,
      keywords: [],
      method: source.method,
      url: source.url,
      headers: source.headers === null ? undefined : source.headers,
      body: source.body,
      saveAs: source.saveAs,
      code: source.code,
      conditions: source.conditions === null ? undefined : source.conditions,
      delaySeconds: source.delaySeconds,
      inputKind: source.inputKind,
      inputError: source.inputError,
      listSource: source.listSource,
      listTemplate: source.listTemplate,
      listEmpty: source.listEmpty,
      listLimit: source.listLimit,
      nextBlockId: source.nextBlockId,
      // Кладём рядом с оригиналом, чтобы копию было видно сразу.
      positionX: source.positionX + 40,
      positionY: source.positionY + 40,
      buttons: {
        create: source.buttons.map((button) => ({
          label: button.label,
          position: button.position,
          targetBlockId: button.targetBlockId,
          url: button.url,
        })),
      },
    },
  });

  revalidatePath(`/scenarios/${source.scenarioId}`);
  return { id: copy.id };
}

/** Удаление блока из панели редактора — без перехода на другую страницу. */
export async function removeBlock(blockId: string): Promise<void> {
  await requireAuth();
  const block = await prisma.scenarioBlock.findUnique({ where: { id: blockId } });
  if (!block) return;

  await prisma.scenarioBlock.delete({ where: { id: blockId } });
  revalidatePath(`/scenarios/${block.scenarioId}`);
}

/** Убирает переход «дальше» у запроса, кода, паузы или условия. */
export async function clearNextBlock(blockId: string): Promise<void> {
  await requireAuth();
  const block = await prisma.scenarioBlock.update({
    where: { id: blockId },
    data: { nextBlockId: null },
  });
  revalidatePath(`/scenarios/${block.scenarioId}`);
}

/** Убирает переход у правила условия по его номеру в списке. */
export async function clearConditionTarget(blockId: string, ruleIndex: number): Promise<void> {
  await requireAuth();
  const block = await prisma.scenarioBlock.findUnique({ where: { id: blockId } });
  if (!block || !Array.isArray(block.conditions)) return;

  const rules = [...(block.conditions as Record<string, unknown>[])];
  if (!rules[ruleIndex]) return;
  rules[ruleIndex] = { ...rules[ruleIndex], targetBlockId: null };

  await prisma.scenarioBlock.update({
    where: { id: blockId },
    data: { conditions: JSON.parse(JSON.stringify(rules)) },
  });
  revalidatePath(`/scenarios/${block.scenarioId}`);
}

/** Сохраняет точку перегиба связи — пользователь перетащил линию на схеме. */
export async function saveLinkWaypoint(
  kind: "button" | "next",
  id: string,
  point: { x: number; y: number } | null,
): Promise<void> {
  await requireAuth();

  if (kind === "button") {
    const button = await prisma.scenarioButton.update({
      where: { id },
      data: {
        waypointX: point ? Math.round(point.x) : null,
        waypointY: point ? Math.round(point.y) : null,
      },
      include: { block: true },
    });
    revalidatePath(`/scenarios/${button.block.scenarioId}`);
    return;
  }

  const block = await prisma.scenarioBlock.update({
    where: { id },
    data: {
      nextWaypointX: point ? Math.round(point.x) : null,
      nextWaypointY: point ? Math.round(point.y) : null,
    },
  });
  revalidatePath(`/scenarios/${block.scenarioId}`);
}
