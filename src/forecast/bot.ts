import { resolveTarget } from "../config/chats";
import { isDatabaseConfigured } from "../knowledge/db";
import { sendMessage } from "../max/client";
import { downloadMaxFile, type IncomingMaxFile } from "../max/fileAttachments";
import type { ExtractedMaxUpdate } from "../types/max";
import { formatExtendedDataStatus, formatHistory, formatWeather } from "./analysisFormatter";
import { buildForecast } from "./forecastEngine";
import { formatUploadSuccess } from "./formatter";
import { formatScopedManagerReport, formatScopedReturnCandidates } from "./managerReport";
import { analyticsCategoryMenu, analyticsMainMenu, reportMenu } from "./menu";
import { parsePlanFactWorkbook } from "./planFactParser";
import { parsePeriodComparisonWorkbook } from "./comparisonParser";
import { detectForecastUploadType, uploadTypeLabel, type ForecastUploadType } from "./reportTypes";
import { listLatestPlanFactSnapshots, savePlanFactSnapshot } from "./repository";
import { parseSalesAnalysisWorkbook } from "./salesAnalysisParser";
import { findCategoryFromCommand, scopeSnapshot, scopeTitle, type ManagerKey, type ReportScope } from "./scopes";
import { latestSupportingReports, saveSupportingReport } from "./supportingRepository";
import type { StoredPlanFactSnapshot, WeatherSummary } from "./types";
import { getKaliningradWeatherSummary } from "./weather";

function targetFor(update: ExtractedMaxUpdate): { userId?: string; chatId?: string } {
  return update.chatId ? { chatId: update.chatId } : { userId: update.userId ?? undefined };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/^\//, "").replace(/\s+/g, " ");
}

type ForecastCommand =
  | { kind: "menu" }
  | { kind: "report"; scope: ReportScope }
  | { kind: "categories" }
  | { kind: "data" }
  | { kind: "history" }
  | { kind: "weather" }
  | { kind: "return"; scope: ReportScope }
  | { kind: "publish_all" }
  | { kind: "publish"; scope: ReportScope };

function managerScope(value: ManagerKey): ReportScope {
  return { kind: "manager", manager: value };
}

function publishedScope(value: string): ReportScope | null {
  const cleaned = value
    .replace(/^опубликовать\s+/i, "")
    .replace(/^отчет\s*:?\s*/i, "")
    .replace(/^категорию?\s+/i, "")
    .trim();
  if (["общий отчет", "общий", "анализ"].includes(cleaned)) return { kind: "overall" };
  if (cleaned === "влад") return managerScope("vlad");
  if (cleaned === "кристина") return managerScope("kristina");
  const category = findCategoryFromCommand(cleaned);
  return category ? { kind: "category", category } : null;
}

export function parseForecastCommand(text: string): ForecastCommand | null {
  const value = normalize(text);
  if (["аналитика", "меню аналитики", "отчеты", "отчеты аналитики"].includes(value)) return { kind: "menu" };
  if (["общий отчет", "анализ", "план", "plan", "покажи план", "как идем по плану", "причины", "почему", "почему падаем", "что делать", "действия", "рекомендации"].includes(value)) {
    return { kind: "report", scope: { kind: "overall" } };
  }
  if (["отчет влад", "влад", "мои категории"].includes(value)) return { kind: "report", scope: managerScope("vlad") };
  if (["отчет кристина", "кристина", "категории кристины"].includes(value)) return { kind: "report", scope: managerScope("kristina") };
  if (["категории", "выбрать категорию"].includes(value)) return { kind: "categories" };
  if (["данные", "data", "актуальность данных"].includes(value)) return { kind: "data" };
  if (["история", "прогресс", "динамика"].includes(value)) return { kind: "history" };
  if (["погода", "weather"].includes(value)) return { kind: "weather" };
  if (["вернуть", "возврат", "что вернуть"].includes(value)) return { kind: "return", scope: { kind: "overall" } };
  if (["отправить отчеты в мониторинг", "опубликовать отчеты", "отправить в мониторинг"].includes(value)) return { kind: "publish_all" };
  if (value.startsWith("опубликовать ")) {
    const scope = publishedScope(value);
    if (scope) return { kind: "publish", scope };
  }
  if (value.startsWith("категория ")) {
    const category = findCategoryFromCommand(value);
    if (category) return { kind: "report", scope: { kind: "category", category } };
  }
  return null;
}

async function safeWeather(): Promise<WeatherSummary | null> {
  try { return await getKaliningradWeatherSummary(); }
  catch (error) { console.warn("Forecast weather unavailable", error); return null; }
}

function scopedSnapshots(raw: StoredPlanFactSnapshot[], scope: ReportScope): StoredPlanFactSnapshot[] {
  return raw.map((snapshot) => scopeSnapshot(snapshot, scope)).filter((snapshot): snapshot is StoredPlanFactSnapshot => Boolean(snapshot));
}

function previousForecastRatio(snapshots: StoredPlanFactSnapshot[], weather: WeatherSummary | null): number | null {
  const previous = snapshots[1];
  if (!previous) return null;
  return buildForecast(previous, snapshots[2] ?? null, weather).forecastRevenueRatio;
}

async function buildScopedReport(sourceUserId: string, scope: ReportScope): Promise<{
  text: string;
  snapshots: StoredPlanFactSnapshot[];
}> {
  const rawSnapshots = await listLatestPlanFactSnapshots(sourceUserId, 3);
  const snapshots = scopedSnapshots(rawSnapshots, scope);
  if (!snapshots[0]) throw new Error(`Нет план-факта для области «${scopeTitle(scope)}».`);
  const supporting = await latestSupportingReports(sourceUserId);
  const weather = await safeWeather();
  const result = buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather));
  return {
    text: formatScopedManagerReport({
      scope,
      result,
      comparisonReport: supporting.comparison,
      salesReport: supporting.sales
    }),
    snapshots
  };
}

async function sendScopedReport(update: ExtractedMaxUpdate, scope: ReportScope): Promise<void> {
  const report = await buildScopedReport(update.userId!, scope);
  await sendMessage(targetFor(update), report.text, { attachments: reportMenu(scope) });
}

async function publishScopedReport(sourceUserId: string, scope: ReportScope): Promise<void> {
  const destination = resolveTarget(null);
  if (!destination.chatId) throw new Error("Для публикации в чат настройте TARGET_CHAT_ID.");
  const report = await buildScopedReport(sourceUserId, scope);
  await sendMessage({ chatId: destination.chatId }, report.text);
}

async function publishManagerReports(sourceUserId: string): Promise<void> {
  await publishScopedReport(sourceUserId, managerScope("vlad"));
  await publishScopedReport(sourceUserId, managerScope("kristina"));
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
    if (command.kind === "menu") {
      await sendMessage(targetFor(update), "📊 Аналитика категорий\n\nВыберите нужный отчёт:", { attachments: analyticsMainMenu() });
      return true;
    }
    if (command.kind === "categories") {
      await sendMessage(targetFor(update), "📦 Выберите категорию:", { attachments: analyticsCategoryMenu() });
      return true;
    }
    if (command.kind === "report") {
      await sendScopedReport(update, command.scope);
      return true;
    }
    if (command.kind === "publish_all") {
      await publishManagerReports(update.userId);
      await sendMessage(targetFor(update), "✅ Краткие отчёты Влада и Кристины отправлены в чат мониторинга цен.", { attachments: analyticsMainMenu() });
      return true;
    }
    if (command.kind === "publish") {
      await publishScopedReport(update.userId, command.scope);
      await sendMessage(targetFor(update), `✅ «${scopeTitle(command.scope)}» отправлен в чат мониторинга цен.`, { attachments: analyticsMainMenu() });
      return true;
    }

    const rawSnapshots = await listLatestPlanFactSnapshots(update.userId, command.kind === "history" ? 12 : 3);
    const supporting = await latestSupportingReports(update.userId);
    if (command.kind === "data") {
      await sendMessage(targetFor(update), formatExtendedDataStatus({
        snapshots: rawSnapshots,
        comparisonReport: supporting.comparison,
        salesReport: supporting.sales
      }), { attachments: analyticsMainMenu() });
      return true;
    }
    if (command.kind === "history") {
      const snapshots = scopedSnapshots(rawSnapshots, { kind: "overall" });
      await sendMessage(targetFor(update), formatHistory(snapshots), { attachments: analyticsMainMenu() });
      return true;
    }
    if (command.kind === "weather") {
      await sendMessage(targetFor(update), formatWeather(await safeWeather()), { attachments: analyticsMainMenu() });
      return true;
    }
    if (command.kind === "return") {
      const reportDate = rawSnapshots[0]?.reportDate;
      if (!reportDate) throw new Error("План-факт пока не загружен.");
      await sendMessage(targetFor(update), formatScopedReturnCandidates({
        scope: command.scope,
        reportDate,
        salesReport: supporting.sales
      }), { attachments: analyticsMainMenu() });
      return true;
    }
  } catch (error) {
    console.warn("Forecast command failed", error);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    await sendMessage(targetFor(update), `Не удалось выполнить команду. ${message}`, { attachments: analyticsMainMenu() });
  }
  return true;
}

async function processPlanFact(update: ExtractedMaxUpdate, file: IncomingMaxFile, buffer: Buffer): Promise<string> {
  const parsed = parsePlanFactWorkbook(buffer, file.filename);
  await savePlanFactSnapshot({ parsed, sourceUserId: update.userId!, sourceChatId: update.chatId, messageId: update.messageId });
  const rawSnapshots = await listLatestPlanFactSnapshots(update.userId!, 3);
  const snapshots = scopedSnapshots(rawSnapshots, { kind: "overall" });
  if (!snapshots[0]) throw new Error("Снимок отчёта не найден после сохранения.");
  const weather = await safeWeather();
  const result = buildForecast(snapshots[0], snapshots[1] ?? null, weather, previousForecastRatio(snapshots, weather));
  return `${formatUploadSuccess(result, file.filename)}\n\nСезонный товар исключён из текущего прогноза до ноября.`;
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
      "Сезонный товар будет исключён из текущих отчётов.",
      "Откройте «Меню аналитики» для общего отчёта или выбора категории."
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
    "Сезонные позиции отфильтровываются при формировании отчётов.",
    "Откройте «Меню аналитики» для отчётов Влада, Кристины или конкретной категории."
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
      ].join("\n"), { attachments: analyticsMainMenu() });
      continue;
    }
    await sendMessage(targetFor(update), `⏳ Получен ${uploadTypeLabel(type)}: ${file.filename}. Загружаю и проверяю структуру…`);
    try {
      const buffer = await downloadMaxFile(file.url);
      const response = type === "plan_fact"
        ? await processPlanFact(update, file, buffer)
        : await processSupporting(update, file, buffer, type);
      await sendMessage(targetFor(update), response, { attachments: analyticsMainMenu() });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Неизвестная ошибка";
      const message = /timeout|aborted/i.test(raw) ? "MAX не успел отдать файл. Отправьте его повторно после обновления." : raw;
      console.warn("Forecast file processing failed", { filename: file.filename, type, error });
      await sendMessage(targetFor(update), `⚠️ Не удалось обработать ${file.filename}\n\n${message}`, { attachments: analyticsMainMenu() });
    }
  }
  return true;
}
