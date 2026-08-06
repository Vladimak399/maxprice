import { sendMessage } from "../max/client";
import { downloadMaxFile, type IncomingMaxFile } from "../max/fileAttachments";
import type { ExtractedMaxUpdate } from "../types/max";
import { isDatabaseConfigured } from "../knowledge/db";
import { formatActions, formatExtendedDataStatus, formatHistory, formatReasons, formatReturnCandidates, formatWeather } from "./analysisFormatter";
import { buildForecast } from "./forecastEngine";
import { formatPlan, formatUploadSuccess } from "./formatter";
import { parsePlanFactWorkbook } from "./planFactParser";
import { parsePeriodComparisonWorkbook } from "./comparisonParser";
import { detectForecastUploadType, uploadTypeLabel, type ForecastUploadType } from "./reportTypes";
import { listLatestPlanFactSnapshots, savePlanFactSnapshot } from "./repository";
import { parseSalesAnalysisWorkbook } from "./salesAnalysisParser";
import { latestSupportingReports, saveSupportingReport } from "./supportingRepository";
import { getKaliningradWeatherSummary } from "./weather";

function targetFor(update: ExtractedMaxUpdate): { userId?: string; chatId?: string } {
  return update.chatId ? { chatId: update.chatId } : { userId: update.userId ?? undefined };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/^\//, "").replace(/\s+/g, " ");
}

type ForecastCommand = "plan" | "data" | "reasons" | "actions" | "return" | "history" | "weather";

export function parseForecastCommand(text: string): ForecastCommand | null {
  const value = normalize(text);
  if (["план", "plan", "покажи план", "как идем по плану"].includes(value)) return "plan";
  if (["данные", "data", "актуальность данных"].includes(value)) return "data";
  if (["причины", "почему", "почему падаем"].includes(value)) return "reasons";
  if (["что делать", "действия", "рекомендации"].includes(value)) return "actions";
  if (["вернуть", "возврат", "что вернуть"].includes(value)) return "return";
  if (["история", "прогресс", "динамика"].includes(value)) return "history";
  if (["погода", "weather"].includes(value)) return "weather";
  return null;
}

async function safeWeather() {
  try { return await getKaliningradWeatherSummary(); }
  catch (error) { console.warn("Forecast weather unavailable", error); return null; }
}

function previousForecastRatio(snapshots: Awaited<ReturnType<typeof listLatestPlanFactSnapshots>>, weather: Awaited<ReturnType<typeof safeWeather>>): number | null {
  const previous = snapshots[1];
  if (!previous) return null;
  return buildForecast(previous, snapshots[2] ?? null, weather).forecastRevenueRatio;
}

export async function handleForecastCommand(update: ExtractedMaxUpdate): Promise<boolean> {
  const command = parseForecastCommand(update.text);
  if (!command) return false;
  if (!update.userId) {
    await sendMessage(targetFor(update), "Не удалось определить отправителя команды.");
    return true;
  }
  if (!isDatabaseConfigured()) {
    await sendMessage(targetFor(update), "Аналитика пока недоступна: DATABASE_URL не настроен.");
    return true;
  }

  try {
    const snapshots = await listLatestPlanFactSnapshots(update.userId, command === "history" ? 12 : 3);
    const supporting = await latestSupportingReports(update.userId);

    if (command === "data") {
      await sendMessage(targetFor(update), formatExtendedDataStatus({
        snapshots,
        comparisonReport: supporting.comparison,
        salesReport: supporting.sales
      }));
      return true;
    }
    if (command === "history") {
      await sendMessage(targetFor(update), formatHistory(snapshots));
      return true;
    }
    if (command === "actions") {
      await sendMessage(targetFor(update), formatActions(supporting.comparison, supporting.sales));
      return true;
    }
    if (command === "return") {
      await sendMessage(targetFor(update), formatReturnCandidates(supporting.sales));
      return true;
    }
    if (command === "weather") {
      await sendMessage(targetFor(update), formatWeather(await safeWeather()));
      return true;
    }

    const weather = await safeWeather();
    const result = snapshots[0]
      ? buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather))
      : null;
    if (command === "reasons") {
      await sendMessage(targetFor(update), formatReasons(result, supporting.comparison));
      return true;
    }
    if (!result) {
      await sendMessage(targetFor(update), "План-факт пока не загружен. Отправьте файл вида «факт 08.08.xlsx».");
      return true;
    }
    await sendMessage(targetFor(update), formatPlan(result));
  } catch (error) {
    console.warn("Forecast command failed", error);
    await sendMessage(targetFor(update), "Не удалось выполнить команду. Проверьте данные и попробуйте ещё раз.");
  }
  return true;
}

async function processPlanFact(update: ExtractedMaxUpdate, file: IncomingMaxFile, buffer: Buffer): Promise<string> {
  const parsed = parsePlanFactWorkbook(buffer, file.filename);
  await savePlanFactSnapshot({ parsed, sourceUserId: update.userId!, sourceChatId: update.chatId, messageId: update.messageId });
  const snapshots = await listLatestPlanFactSnapshots(update.userId!, 3);
  if (!snapshots[0]) throw new Error("Снимок отчёта не найден после сохранения.");
  const weather = await safeWeather();
  const result = buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather));
  return formatUploadSuccess(result, file.filename);
}

async function processSupporting(update: ExtractedMaxUpdate, file: IncomingMaxFile, buffer: Buffer, type: Exclude<ForecastUploadType, "plan_fact">): Promise<string> {
  const summary = type === "period_comparison"
    ? parsePeriodComparisonWorkbook(buffer, file.filename)
    : parseSalesAnalysisWorkbook(buffer, file.filename);
  await saveSupportingReport({ summary, sourceUserId: update.userId!, sourceChatId: update.chatId, messageId: update.messageId });
  if (summary.type === "period_comparison") {
    return [
      "✅ СРАВНЕНИЕ СОХРАНЕНО",
      "",
      `Файл: ${file.filename}`,
      `Период: ${summary.periodStart.split("-").reverse().join(".")}–${summary.periodEnd.split("-").reverse().join(".")}`,
      `Категорий: ${summary.categories.length}, подкатегорий: ${summary.subcategories.length}`,
      "",
      "Команды: «Причины», «Что делать», «Данные»."
    ].join("\n");
  }
  return [
    "✅ ПРОДАЖИ С АНАЛИЗОМ СОХРАНЕНЫ",
    "",
    `Файл: ${file.filename}`,
    `Период: ${summary.periodStart.split("-").reverse().join(".")}–${summary.periodEnd.split("-").reverse().join(".")}`,
    `Проанализировано товарных строк: ${summary.itemCount}`,
    `Кандидатов на возврат: ${summary.returnCandidates.length}`,
    `Остаток без продаж: ${summary.stockWithoutSales.length}`,
    `Излишний запас: ${summary.overstock.length}`,
    "",
    "Команды: «Что делать», «Вернуть», «Причины», «Данные»."
  ].join("\n");
}

export async function processForecastFiles(update: ExtractedMaxUpdate, files: IncomingMaxFile[]): Promise<boolean> {
  if (!files.length) return false;
  if (!update.userId) {
    await sendMessage(targetFor(update), "Не удалось определить отправителя файла.");
    return true;
  }
  if (!isDatabaseConfigured()) {
    await sendMessage(targetFor(update), "Файл не сохранён: DATABASE_URL не настроен.");
    return true;
  }

  for (const file of files) {
    const type = detectForecastUploadType(file.filename);
    if (!type) {
      await sendMessage(targetFor(update), [
        `⚠️ Не удалось определить тип файла ${file.filename}.`,
        "Поддерживаются:",
        "• факт ДД.ММ.xlsx",
        "• сравнение с прошлым периодом ММ.xlsx",
        "• продажи с анализом ММ.xlsx"
      ].join("\n"));
      continue;
    }
    await sendMessage(targetFor(update), `⏳ Получен ${uploadTypeLabel(type)}: ${file.filename}. Загружаю и проверяю структуру…`);
    try {
      const buffer = await downloadMaxFile(file.url);
      const response = type === "plan_fact"
        ? await processPlanFact(update, file, buffer)
        : await processSupporting(update, file, buffer, type);
      await sendMessage(targetFor(update), response);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Неизвестная ошибка";
      const message = /timeout|aborted/i.test(raw) ? "MAX не успел отдать файл. Отправьте его повторно после обновления." : raw;
      console.warn("Forecast file processing failed", { filename: file.filename, type, error });
      await sendMessage(targetFor(update), `⚠️ Не удалось обработать ${file.filename}\n\n${message}`);
    }
  }
  return true;
}
