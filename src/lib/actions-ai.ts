"use server";

import { revalidatePath } from "next/cache";
import { runAssistant, type AssistantResult, type AssistantTurn } from "@/lib/ai-assistant";
import { requireAuth } from "@/lib/auth";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Ход диалога с AI-помощником: текст, история и приложенные файлы. */
export async function askAssistant(formData: FormData): Promise<AssistantResult> {
  await requireAuth();
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!scenarioId || !message) return { reply: "", applied: [], error: "Пустой запрос" };

  let history: AssistantTurn[] = [];
  try {
    history = JSON.parse(String(formData.get("history") ?? "[]"));
  } catch {
    history = [];
  }

  const files = [];
  for (const entry of formData.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_FILE_BYTES) {
      return { reply: "", applied: [], error: `Файл ${entry.name} больше 10 МБ` };
    }
    files.push({
      name: entry.name,
      mime: entry.type || "application/octet-stream",
      bytes: Buffer.from(await entry.arrayBuffer()),
    });
  }

  const result = await runAssistant({ scenarioId, history: history.slice(-12), message, files });
  if (result.applied.length) revalidatePath(`/scenarios/${scenarioId}`);
  return result;
}
