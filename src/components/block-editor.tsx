"use client";

import { useActionState, useState } from "react";
import { testBlock, updateBlock, type TestResult } from "@/lib/actions-scenarios";
import { OPERATOR_LABELS, parseRules, type ConditionOperator } from "@/lib/conditions";

const controlClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export type EditorBlock = {
  id: string;
  kind: "MESSAGE" | "REQUEST" | "CODE" | "CONDITION" | "DELAY" | "HANDOFF" | "INPUT";
  title: string;
  text: string;
  imageId: string | null;
  isStart: boolean;
  keywords: string[];
  method: string | null;
  url: string | null;
  headers: Record<string, string> | null;
  body: string | null;
  saveAs: string | null;
  code: string | null;
  conditions: unknown;
  inputKind: string | null;
  inputError: string | null;
  delaySeconds: number | null;
  listSource: string | null;
  listTemplate: string | null;
  listEmpty: string | null;
  listLimit: number | null;
  nextBlockId: string | null;
  buttons: { id: string; label: string; targetBlockId: string | null; url: string | null }[];
  nextWaypoint?: { x: number; y: number } | null;
};

type BlockOption = { id: string; title: string };
type ButtonDraft = { label: string; target: string; url: string };
type RuleDraft = { field: string; operator: ConditionOperator; value: string; target: string };

const KINDS: { value: EditorBlock["kind"]; label: string; hint: string }[] = [
  { value: "MESSAGE", label: "Сообщение", hint: "Текст, картинка и кнопки" },
  { value: "REQUEST", label: "Запрос", hint: "GET/POST к внешнему сервису" },
  { value: "CODE", label: "Код", hint: "Свои вычисления на JavaScript" },
  { value: "CONDITION", label: "Условие", hint: "Развилка по данным человека" },
  { value: "DELAY", label: "Пауза", hint: "Подождать перед следующим блоком" },
  { value: "HANDOFF", label: "Оператор", hint: "Передать диалог живому человеку" },
  { value: "INPUT", label: "Вопрос", hint: "Спросить и запомнить ответ" },
];

export function BlockEditor({ block, blocks }: { block: EditorBlock; blocks: BlockOption[] }) {
  const [state, formAction, pending] = useActionState(updateBlock, {} as {
    error?: string;
    ok?: string;
  });
  const [kind, setKind] = useState<EditorBlock["kind"]>(block.kind);
  const [testState, testAction, testing] = useActionState(testBlock, {} as TestResult);
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    parseRules(block.conditions).map((rule) => ({
      field: rule.field,
      operator: rule.operator,
      value: rule.value ?? "",
      target: rule.targetBlockId ?? "",
    })),
  );
  const [buttons, setButtons] = useState<ButtonDraft[]>(
    block.buttons.map((button) => ({
      label: button.label,
      target: button.targetBlockId ?? "",
      url: button.url ?? "",
    })),
  );

  const headersText = block.headers
    ? Object.entries(block.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    : "";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={block.id} />

      <div className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <label
            key={option.value}
            title={option.hint}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
              kind === option.value
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--line)]"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={option.value}
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Название блока
          <input name="title" defaultValue={block.title} className={`mt-1 ${controlClass}`} />
        </label>

        <label className="block text-sm font-medium">
          Ключевые слова
          <input
            name="keywords"
            defaultValue={block.keywords.join(", ")}
            placeholder="через запятую"
            className={`mt-1 ${controlClass}`}
          />
        </label>
      </div>

      {kind === "MESSAGE" ? (
        <>
          <label className="block text-sm font-medium">
            Текст сообщения
            <textarea
              name="text"
              rows={5}
              defaultValue={block.text}
              className={`mt-1 ${controlClass}`}
            />
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
              Можно подставлять данные: {"{{name}}"}, {"{{city}}"} или переменную из запроса
            </span>
          </label>

          <details className="rounded-lg border border-[var(--line)] p-3" open={Boolean(block.listSource)}>
            <summary className="cursor-pointer text-sm font-medium">
              Список из данных запроса
            </summary>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Возьмём массив из переменной и нарисуем каждый элемент по шаблону. В тексте
              сообщения поставьте {"{{list}}"} — туда встанет список (или он добавится в конец).
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Где лежит массив
                <input
                  name="listSource"
                  defaultValue={block.listSource ?? ""}
                  placeholder="games.games"
                  className={`mt-1 ${controlClass}`}
                />
              </label>
              <label className="block text-sm">
                Сколько показывать
                <input
                  type="number"
                  name="listLimit"
                  min={1}
                  defaultValue={block.listLimit ?? ""}
                  placeholder="5"
                  className={`mt-1 ${controlClass}`}
                />
              </label>
            </div>

            <label className="mt-3 block text-sm">
              Шаблон одной строки
              <textarea
                name="listTemplate"
                rows={4}
                defaultValue={block.listTemplate ?? ""}
                placeholder={"{{name}}\n📅 {{date}}, {{time}}\n📍 {{location}}\n🔗 {{registration_url}}\n"}
                className={`mt-1 ${controlClass} font-mono`}
              />
            </label>

            <label className="mt-3 block text-sm">
              Если список пуст
              <input
                name="listEmpty"
                defaultValue={block.listEmpty ?? ""}
                placeholder="На эти даты игр пока нет"
                className={`mt-1 ${controlClass}`}
              />
            </label>
          </details>

          <div>
            <div className="text-sm font-medium">Картинка</div>
            {block.imageId ? (
              <div className="mt-2 flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/${block.imageId}`}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-[var(--line)] object-cover"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="removeImage" />
                  Убрать
                </label>
              </div>
            ) : null}
            <input
              type="file"
              name="image"
              accept="image/*"
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-white file:px-3 file:py-2 file:text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Кнопки</div>
              <button
                type="button"
                onClick={() => setButtons((list) => [...list, { label: "", target: "", url: "" }])}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
              >
                Добавить
              </button>
            </div>

            <p className="mt-1 text-xs text-[var(--muted)]">
              Если указать ссылку, кнопка откроет сайт вместо перехода по сценарию.
            </p>

            <div className="mt-2 space-y-2">
              {buttons.map((button, index) => (
                <div key={index} className="space-y-1 rounded-lg border border-[var(--line)] p-2">
                  <input
                    name="buttonLabel"
                    value={button.label}
                    onChange={(event) =>
                      setButtons((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Текст на кнопке"
                    className={controlClass}
                  />
                  <input
                    name="buttonUrl"
                    value={button.url}
                    onChange={(event) =>
                      setButtons((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, url: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Ссылка на сайт (необязательно)"
                    className={controlClass}
                  />
                  <div className="flex items-center gap-2">
                    {/* defaultValue, а не value: React после сохранения сбрасывает форму,
                        и управляемый select теряет выбор — связи кнопок пропадали. */}
                    <select
                      name="buttonTarget"
                      aria-disabled={Boolean(button.url.trim())}
                      defaultValue={button.target}
                      onChange={(event) =>
                        setButtons((list) =>
                          list.map((item, position) =>
                            position === index ? { ...item, target: event.target.value } : item,
                          ),
                        )
                      }
                      className={`${controlClass} ${button.url.trim() ? "opacity-50" : ""}`}
                    >
                      <option value="">— ведёт в никуда —</option>
                      {blocks.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setButtons((list) => list.filter((_, position) => position !== index))
                      }
                      className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-red-600 hover:border-red-300"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isStart" defaultChecked={block.isStart} />С этого блока
            начинается диалог
          </label>
        </>
      ) : null}

      {kind === "REQUEST" ? (
        <>
          <div className="flex gap-2">
            <label className="block text-sm font-medium">
              Метод
              <select
                name="method"
                defaultValue={block.method ?? "GET"}
                className={`mt-1 ${controlClass}`}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 text-sm font-medium">
              Адрес
              <input
                name="url"
                defaultValue={block.url ?? ""}
                placeholder="https://api.example.com/orders?phone={{phone}}"
                className={`mt-1 ${controlClass}`}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Заголовки
            <textarea
              name="headers"
              rows={3}
              defaultValue={headersText}
              placeholder={"Authorization: Bearer ...\nContent-Type: application/json"}
              className={`mt-1 ${controlClass} font-mono`}
            />
          </label>

          <label className="block text-sm font-medium">
            Тело запроса
            <textarea
              name="body"
              rows={4}
              defaultValue={block.body ?? ""}
              placeholder={'{"phone": "{{phone}}", "name": "{{name}}"}'}
              className={`mt-1 ${controlClass} font-mono`}
            />
          </label>

          <label className="block text-sm font-medium">
            Сохранить ответ в переменную
            <input
              name="saveAs"
              defaultValue={block.saveAs ?? ""}
              placeholder="order"
              className={`mt-1 ${controlClass}`}
            />
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
              Дальше подставляется как {"{{order.status}}"}. Рядом появятся {"{{order_ok}}"} и{" "}
              {"{{order_status}}"} — успех и код ответа.
            </span>
          </label>
        </>
      ) : null}

      {kind === "CODE" ? (
        <label className="block text-sm font-medium">
          Код
          <textarea
            name="code"
            rows={10}
            defaultValue={block.code ?? ""}
            placeholder={"// data — данные человека, vars — что сохранить\nvars.discount = data.city === 'Москва' ? 10 : 5;"}
            className={`mt-1 ${controlClass} font-mono`}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            JavaScript, до 2 секунд на выполнение. Доступны data (имя, телефон, город,
            переменные) и vars — всё, что в него записали, сохранится человеку.
          </span>
        </label>
      ) : null}

      {kind === "CONDITION" ? (
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Правила</div>
            <button
              type="button"
              onClick={() =>
                setRules((list) => [...list, { field: "city", operator: "eq", value: "", target: "" }])
              }
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
            >
              Добавить
            </button>
          </div>

          <p className="mt-1 text-xs text-[var(--muted)]">
            Проверяются сверху вниз, срабатывает первое подходящее. Если ни одно не подошло —
            идём по ветке «иначе».
          </p>

          <div className="mt-2 space-y-2">
            {rules.map((rule, index) => (
              <div key={index} className="space-y-1 rounded-lg border border-[var(--line)] p-2">
                <div className="flex gap-2">
                  <input
                    name="conditionField"
                    value={rule.field}
                    onChange={(event) =>
                      setRules((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, field: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="city, phone, order.status"
                    className={controlClass}
                  />
                  <select
                    name="conditionOperator"
                    defaultValue={rule.operator}
                    onChange={(event) =>
                      setRules((list) =>
                        list.map((item, position) =>
                          position === index
                            ? { ...item, operator: event.target.value as ConditionOperator }
                            : item,
                        ),
                      )
                    }
                    className={controlClass}
                  >
                    {(Object.keys(OPERATOR_LABELS) as ConditionOperator[]).map((operator) => (
                      <option key={operator} value={operator}>
                        {OPERATOR_LABELS[operator]}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  name="conditionValue"
                  value={rule.value}
                  onChange={(event) =>
                    setRules((list) =>
                      list.map((item, position) =>
                        position === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="значение"
                  className={controlClass}
                  disabled={rule.operator === "empty" || rule.operator === "notEmpty"}
                />

                <div className="flex items-center gap-2">
                  <select
                    name="conditionTarget"
                    defaultValue={rule.target}
                    onChange={(event) =>
                      setRules((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, target: event.target.value } : item,
                        ),
                      )
                    }
                    className={controlClass}
                  >
                    <option value="">— выбрать блок —</option>
                    {blocks
                      .filter((option) => option.id !== block.id)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRules((list) => list.filter((_, position) => position !== index))}
                    className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-red-600 hover:border-red-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {kind === "DELAY" ? (
        <label className="block text-sm font-medium">
          Подождать, секунд
          <input
            type="number"
            name="delaySeconds"
            min={1}
            defaultValue={block.delaySeconds ?? 60}
            className={`mt-1 ${controlClass}`}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            Бот вернётся к диалогу сам, даже если человек ничего не написал
          </span>
        </label>
      ) : null}

      {kind === "INPUT" ? (
        <>
          <label className="block text-sm font-medium">
            Вопрос человеку
            <textarea
              name="text"
              rows={3}
              defaultValue={block.text}
              placeholder="На какую дату посмотреть игры? Напишите, например: 12.09"
              className={`mt-1 ${controlClass}`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Что ждём в ответе
              <select
                name="inputKind"
                defaultValue={block.inputKind ?? "text"}
                className={`mt-1 ${controlClass}`}
              >
                <option value="text">Любой текст</option>
                <option value="date">Дату</option>
                <option value="phone">Телефон</option>
                <option value="email">E-mail</option>
                <option value="city">Город</option>
              </select>
            </label>

            <label className="block text-sm font-medium">
              Сохранить в переменную
              <input
                name="saveAs"
                defaultValue={block.saveAs ?? ""}
                placeholder="userDate"
                className={`mt-1 ${controlClass}`}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Если ответ не подошёл
            <input
              name="inputError"
              defaultValue={block.inputError ?? ""}
              placeholder="❌ Похоже, это не email. Пример: name@example.com"
              className={`mt-1 ${controlClass}`}
            />
          </label>

          <p className="text-xs text-[var(--muted)]">
            Телефон, e-mail и город записываются в карточку человека. Для даты рядом
            появится переменная с суффиксом «_iso». Город проверяется по справочнику и
            OpenStreetMap — выдуманное название не пройдёт.
          </p>
        </>
      ) : null}

      {kind === "HANDOFF" ? (
        <label className="block text-sm font-medium">
          Что написать человеку
          <textarea
            name="text"
            rows={3}
            defaultValue={block.text}
            placeholder="Передаю ваш вопрос коллеге, скоро ответим."
            className={`mt-1 ${controlClass}`}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
            После этого бот замолкает: диалог помечается во «Входящих», отвечает человек.
            Вернуть диалог боту можно кнопкой в переписке; сам человек тоже вернётся к боту,
            если нажмёт любую кнопку меню или напишет «Начать».
          </span>
        </label>
      ) : null}

      {kind !== "HANDOFF" && !(kind === "MESSAGE" && buttons.length > 0) ? (
        <label className="block text-sm font-medium">
          {kind === "CONDITION"
            ? "Иначе перейти к блоку"
            : kind === "MESSAGE"
              ? "Сразу после сообщения перейти к блоку"
              : "Дальше перейти к блоку"}
          <select
            name="nextBlockId"
            defaultValue={block.nextBlockId ?? ""}
            className={`mt-1 ${controlClass}`}
          >
            <option value="">{kind === "MESSAGE" ? "— ждать ответа человека —" : "— остановиться —"}</option>
            {blocks
              .filter((option) => option.id !== block.id)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {kind === "REQUEST" || kind === "CODE" || kind === "CONDITION" ? (
        <div>
          <button
            type="submit"
            formAction={testAction}
            disabled={testing}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-60"
          >
            {testing ? "Проверяю…" : "Проверить"}
          </button>
          {testState?.output ? (
            <pre
              className={`mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs ${
                testState.ok ? "bg-[var(--bg)]" : "bg-red-50 text-red-700"
              }`}
            >
              {testState.output}
            </pre>
          ) : null}
          <p className="mt-1 text-xs text-[var(--muted)]">
            Запуск на данных последнего пользователя — ничего никому не отправляется.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохраняю…" : "Сохранить блок"}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}
