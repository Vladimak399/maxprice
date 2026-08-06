import { sendMessage } from "../max/client";
import { downloadMaxFile, type IncomingMaxFile } from "../max/fileAttachments";
import type { ExtractedMaxUpdate } from "../types/max";
import { isDatabaseConfigured } from "../knowledge/db";
import { buildForecast } from "./forecastEngine";
import { formatDataStatus, formatPlan, formatUploadSuccess } from "./formatter";
import { parsePlanFactWorkbook } from "./planFactParser";
import { listLatestPlanFactSnapshots, savePlanFactSnapshot } from "./repository";
import { getKaliningradWeatherSummary } from "./weather";

function targetFor(update: ExtractedMaxUpdate): { userId?: string; chatId?: string } {
  return update.chatId ? { chatId: update.chatId } : { userId: update.userId ?? undefined };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/^\//, "").replace(/\s+/g, " ");
}

export function parseForecastCommand(text: string): "plan" | "data" | null {
  const value = normalize(text);
  if (["план", "plan", "покажи план", "как идем по плану", "как идём по плану"].includes(value)) return "plan";
  if (["данные", "data", "актуальность данных"].includes(value)) return "data";
  return null;
}

async function safeWeather() {
  try { return await getKaliningradWeatherSummary(); }
  catch (error) { console.warn("Forecast weather unavailable", error); return null; }
}

function previousForecastRatio(snapshots: Awaited<ReturnType<typeof listLatestPlanFactSnapshots>>, weather: Awaited<ReturnType<typeof safeWeather>>): number | null {
  const previous = snapshots[1];
  if (!previous) return null;
  const previousPrevious = snapshots[2] ?? null;
  return buildForecast(previous, previousPrevious, weather).forecastRevenueRatio;
}

export async function handleForecastCommand(update: ExtractedMaxUpdate): Promise<boolean> {
  const command = parseForecastCommand(update.text);
  if (!command) return false;
  if (!update.userId) {
    await sendMessage(targetFor(update), "Команда доступна в личном диалоге с ботом.");
    return true;
  }
  if (!isDatabaseConfigured()) {
    await sendMessage(targetFor(update), "Прогноз пока недоступен: DATABASE_URL не настроен.");
    return true;
  }
  try {
    const snapshots = await listLatestPlanFactSnapshots(update.userId, 3);
    if (command === "data") {
      await sendMessage(targetFor(update), formatDataStatus(snapshots));
      return true;
    }
    if (!snapshots[0]) {
      await sendMessage(targetFor(update), formatDataStatus([]));
      return true;
    }
    const weather = await safeWeather();
    const result = buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather));
    await sendMessage(targetFor(update), formatPlan(result));
  } catch (error) {
    console.warn("Forecast command failed", error);
    await sendMessage(targetFor(update), "Не удалось рассчитать план. Проверьте DATABASE_URL и попробуйте ещё раз.");
  }
  return true;
}

export async function processForecastFiles(update: ExtractedMaxUpdate, files: IncomingMaxFile[]): Promise<boolean> {
  if (!files.length) return false;
  if (!update.userId) {
    await sendMessage(targetFor(update), "Excel-отчёты принимаются только в личном диалоге с ботом.");
    return true;
  }
  const supported = files.filter((file) => /\.xlsx$/i.test(file.filename));
  if (!supported.length) {
    await sendMessage(targetFor(update), "Поддерживается накопительный план-факт в формате .xlsx.");
    return true;
  }
  if (!isDatabaseConfigured()) {
    await sendMessage(targetFor(update), "Файл не сохранён: DATABASE_URL не настроен.");
    return true;
  }

  for (const file of supported) {
    await sendMessage(targetFor(update), `⏳ Получен файл ${file.filename}. Проверяю структуру и пересчитываю прогноз…`);
    try {
      const buffer = await downloadMaxFile(file.url);
      const parsed = parsePlanFactWorkbook(buffer, file.filename);
      await savePlanFactSnapshot({ parsed, sourceUserId: update.userId, sourceChatId: update.chatId, messageId: update.messageId });
      const snapshots = await listLatestPlanFactSnapshots(update.userId, 3);
      if (!snapshots[0]) throw new Error("Снимок отчёта не найден после сохранения.");
      const weather = await safeWeather();
      const result = buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather));
      await sendMessage(targetFor(update), formatUploadSuccess(result, file.filename));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      console.warn("Forecast file processing failed", { filename: file.filename, error });
      await sendMessage(targetFor(update), `⚠️ Не удалось обработать ${file.filename}\n\n${message}`);
    }
  }
  return true;
}
