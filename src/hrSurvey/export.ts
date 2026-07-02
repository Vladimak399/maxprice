import { ensureSchema, getSql } from "../knowledge/db";
import { anonSessionId } from "./repository";

export const FORBIDDEN_EXPORT_COLUMNS = ["user_hash", "chat_hash", "source_chat_id", "user_id", "chat_id", "message_id"];

export const CATEGORY_LABELS: Record<string, string> = {
  profile: "Профиль сотрудника",
  clarity: "Понятность задач",
  working_conditions: "Условия работы",
  workload: "Нагрузка",
  schedule: "График",
  team: "Коллектив",
  manager: "Руководитель",
  training: "Обучение",
  onboarding: "Адаптация",
  rules: "Правила и инструкции",
  communication: "Коммуникация",
  compensation: "Зарплата и премии",
  recognition: "Признание работы",
  growth: "Развитие",
  trust: "Доверие к компании",
  satisfaction: "Общая удовлетворенность",
  enps: "Рекомендация работодателя",
  blockers: "Что мешает работать",
  improvements: "Что улучшить",
  comment: "Комментарии",
  anonymous_problem: "Анонимные проблемы"
};

const CATEGORY_HELP: Record<string, { meaning: string; action: string }> = {
  clarity: { meaning: "Непонятны ожидания и приоритеты.", action: "Проверить постановку задач, приоритеты смены и инструкции." },
  working_conditions: { meaning: "Не хватает условий, инструментов или расходников.", action: "Собрать нехватку оборудования, расходников и доступов по точкам." },
  workload: { meaning: "Сотрудники могут не успевать выполнять работу качественно.", action: "Проверить графики, количество людей в смене и пики задач." },
  schedule: { meaning: "Есть напряжение вокруг графика.", action: "Проверить срок публикации графика и частоту изменений." },
  team: { meaning: "Возможны конфликты или слабая взаимопомощь.", action: "Проверить конфликты, текучку и адаптацию новичков." },
  manager: { meaning: "Есть риск проблем в управлении и обратной связи.", action: "Провести управленческий разбор и дать руководителю обратную связь." },
  training: { meaning: "Не хватает обучения для уверенной работы.", action: "Обновить адаптацию, наставничество и базу знаний." },
  onboarding: { meaning: "Новички могут входить в работу без понятного маршрута.", action: "Сделать чек-лист новичка и назначить наставника." },
  rules: { meaning: "Правила и инструкции могут быть непонятны.", action: "Упростить инструкции и канал поиска ответов." },
  communication: { meaning: "Изменения доходят поздно или непонятно.", action: "Проверить, как офис доносит изменения до магазинов." },
  compensation: { meaning: "Есть напряжение вокруг зарплаты, премий или штрафов.", action: "Объяснить систему премий, штрафов и расчёта зарплаты." },
  recognition: { meaning: "Сотрудники не видят признания хорошей работы.", action: "Ввести понятную обратную связь и фиксацию хорошей работы." },
  growth: { meaning: "Не видно развития внутри компании.", action: "Показать карьерные маршруты и условия роста." },
  trust: { meaning: "Есть риск падения доверия к компании.", action: "Разобрать причины недоверия, особенно по комментариям." },
  satisfaction: { meaning: "Итоговый индикатор отношения к работе.", action: "Использовать как главный сигнал и проверять слабые категории." }
};

const PROBLEM_HELP: Record<string, { check: string; action: string }> = {
  "Нехватка сотрудников": { check: "Графики, закрытие смен, текучку, нагрузку по магазинам.", action: "Проверить укомплектованность смен и причины незакрытых часов." },
  "Большая нагрузка": { check: "Распределение задач, пики нагрузки, дублирование задач.", action: "Убрать лишние задачи и перераспределить работу по смене." },
  "График": { check: "Срок публикации графика и частоту изменений.", action: "Зафиксировать правила публикации и изменения графика." },
  "Зарплата": { check: "Прозрачность премий, штрафов и ожидания сотрудников.", action: "Объяснить расчёт зарплаты и премий простым языком." },
  "Руководитель": { check: "Стиль коммуникации, обратную связь, решение рабочих вопросов.", action: "Провести разбор с руководителем." },
  "Коллектив": { check: "Конфликты, текучку, адаптацию новичков.", action: "Разобрать конфликты и усилить адаптацию." },
  "Нехватка обучения": { check: "Адаптацию, инструкции, наставничество.", action: "Обновить обучение и назначить наставников." },
  "Нехватка оборудования или расходников": { check: "Список недостающего по магазинам.", action: "Собрать заявки и закрыть критичные нехватки." },
  "Плохая коммуникация": { check: "Канал постановки задач и сроки доведения изменений.", action: "Навести порядок в каналах задач и ответственных." },
  "Непонятные задачи": { check: "Приоритеты, зоны ответственности, повторяющиеся поручения.", action: "Описать приоритеты и зоны ответственности." },
  "Другое": { check: "Открытые комментарии и анонимные проблемы.", action: "Разобрать комментарии вручную." }
};

const COMMENT_CODES = new Set(["one_change", "keep_good", "anonymous_problem"]);
const NEGATIVE_WORDS = ["плохо", "невозможно", "не хватает", "конфликт", "хамит", "штраф", "задержка", "устал", "увольнение", "бардак", "не успеваю", "проблем"];

type Zone = "red" | "yellow" | "normal";
type CellValue = string | number | null | undefined;
type Cell = CellValue | { value: CellValue; style?: number };
type SheetSpec = { name: string; columns: number[]; rows: Cell[][]; merges?: string[]; freeze?: boolean; autoFilter?: string };

const STYLE = { normal: 0, title: 1, section: 2, header: 3, kpi: 4, red: 5, yellow: 6, green: 7, note: 8, muted: 9 } as const;

function round(value: number, digits = 2): number { return Number(value.toFixed(digits)); }
function pct(value: number): string { return `${round(value * 100, 1)}%`; }
function asNumber(value: unknown): number | null { const number = Number(value); return Number.isFinite(number) ? number : null; }
function asDate(value: unknown): string { return value ? new Date(value as string).toLocaleString("ru-RU") : ""; }
function categoryLabel(category: string): string { return CATEGORY_LABELS[category] ?? category; }
function zoneLabel(zone: Zone): string { return zone === "red" ? "красная" : zone === "yellow" ? "жёлтая" : "нормальная"; }
function zoneStyle(zone: Zone): number { return zone === "red" ? STYLE.red : zone === "yellow" ? STYLE.yellow : STYLE.green; }
function zoneByScore(average: number | null, lowShare: number): Zone { if (average === null) return "normal"; if (average < 3.2 || lowShare > 0.3) return "red"; if (average <= 3.8 || lowShare >= 0.15) return "yellow"; return "normal"; }
function zoneByShare(share: number): Zone { if (share >= 0.3) return "red"; if (share >= 0.15) return "yellow"; return "normal"; }
function conclusion(zone: Zone): string { return zone === "red" ? "Критичная зона. Нужен разбор причин и ответственный." : zone === "yellow" ? "Зона напряжения. Нужно уточнить причины." : "Существенной проблемы не видно."; }

function cell(value: CellValue, style = STYLE.normal): Cell { return { value, style }; }
function red(value: CellValue): Cell { return cell(value, STYLE.red); }
function yellow(value: CellValue): Cell { return cell(value, STYLE.yellow); }
function green(value: CellValue): Cell { return cell(value, STYLE.green); }
function byZone(value: CellValue, zone: Zone): Cell { return cell(value, zoneStyle(zone)); }

function answerOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

function answerText(answer: any): string {
  if (!answer) return "";
  const selected = answerOptions(answer.answer_json);
  if (selected.length) return selected.join(", ");
  const score = asNumber(answer.answer_number);
  return answer.answer_text ?? (score === null ? "" : String(score));
}

function questionStats(questions: any[], answers: any[]) {
  return questions.map((question) => {
    const rows = answers.filter((answer) => answer.question_id === question.id);
    const scores = rows.map((answer) => asNumber(answer.answer_number)).filter((value): value is number => value !== null);
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) if (score >= 1 && score <= 5) counts[score] = (counts[score] ?? 0) + 1;
    const average = scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    const lowShare = scores.length ? ((counts[1] ?? 0) + (counts[2] ?? 0)) / scores.length : 0;
    const highShare = scores.length ? ((counts[4] ?? 0) + (counts[5] ?? 0)) / scores.length : 0;
    return { position: Number(question.position), code: question.code, category: question.category, categoryLabel: categoryLabel(question.category), question: question.text, type: question.type, count: rows.length, average, lowShare, highShare, zone: question.type === "scale_1_5" ? zoneByScore(average, lowShare) : "normal" as Zone, counts };
  });
}

function categoryStats(stats: ReturnType<typeof questionStats>) {
  const map = new Map<string, { sum: number; count: number; lows: number }>();
  for (const stat of stats) {
    if (stat.type !== "scale_1_5" || stat.average === null) continue;
    const current = map.get(stat.category) ?? { sum: 0, count: 0, lows: 0 };
    current.sum += stat.average * stat.count;
    current.count += stat.count;
    current.lows += Math.round(stat.lowShare * stat.count);
    map.set(stat.category, current);
  }
  return [...map.entries()].map(([category, value]) => {
    const average = value.count ? round(value.sum / value.count) : null;
    const lowShare = value.count ? value.lows / value.count : 0;
    const help = CATEGORY_HELP[category] ?? { meaning: "Категория требует ручного анализа.", action: "Разобрать ответы и комментарии." };
    return { category, label: categoryLabel(category), average, count: value.count, lowShare, zone: zoneByScore(average, lowShare), meaning: help.meaning, action: help.action };
  }).sort((left, right) => (left.average ?? 99) - (right.average ?? 99));
}

function problemStats(answers: any[], completed: number) {
  const map = new Map<string, { question: string; option: string; count: number }>();
  for (const answer of answers) for (const option of answerOptions(answer.answer_json)) {
    const key = `${answer.question_text}|${option}`;
    const current = map.get(key) ?? { question: answer.question_text, option, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].map((item) => {
    const share = completed ? item.count / completed : 0;
    const help = PROBLEM_HELP[item.option] ?? PROBLEM_HELP["Другое"]!;
    return { ...item, share, zone: zoneByShare(share), check: help.check, action: help.action };
  }).sort((left, right) => right.count - left.count);
}

function enps(answers: any[]): string {
  const values = answers.filter((answer) => answer.question_code === "enps").map((answer) => answer.answer_text ?? "");
  const promoters = values.filter((value) => value === "Да" || value === "Скорее да").length;
  const detractors = values.filter((value) => value === "Нет" || value === "Скорее нет").length;
  return values.length ? String(Math.round((promoters / values.length - detractors / values.length) * 100)) : "Недостаточно данных";
}

function commentRows(answers: any[], sessionsById: Map<string, any>) {
  return answers.filter((answer) => COMMENT_CODES.has(answer.question_code) && answer.answer_text?.trim()).map((answer) => {
    const session = sessionsById.get(answer.session_id);
    const text = answer.answer_text.trim();
    const lower = text.toLowerCase();
    const topic = /зарплат|прем|деньг|штраф/.test(lower) ? "Зарплата" : /график|смен|выходн/.test(lower) ? "График" : /руковод|директор|админ|начальн/.test(lower) ? "Руководитель" : /коллектив|коллег|конфликт/.test(lower) ? "Коллектив" : /обуч|объясн|не знаю|инструкц/.test(lower) ? "Обучение" : /нагруз|не успеваю|много задач/.test(lower) ? "Нагрузка" : /ценник|товар|поставк|оборудован|расходник/.test(lower) ? "Рабочие процессы" : "Другое";
    const attention = answer.question_code === "anonymous_problem" || NEGATIVE_WORDS.some((word) => lower.includes(word)) ? "Да" : "Нет";
    return { createdAt: asDate(answer.created_at), sessionId: anonSessionId(answer.session_id), employeeGroup: session?.employee_group ?? "", employeeRole: session?.employee_role ?? "", tenure: session?.tenure ?? "", store: session?.store_or_department ?? "", type: answer.question_code === "anonymous_problem" ? "Анонимная проблема" : answer.question_code === "keep_good" ? "Что сохранить" : "Что улучшить", comment: text, topic, attention };
  });
}

function sessionAverage(sessionIds: Set<string>, answers: any[]): number | null {
  const scores = answers.filter((answer) => sessionIds.has(answer.session_id)).map((answer) => asNumber(answer.answer_number)).filter((value): value is number => value !== null);
  return scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}

function sliceRows(title: string, sessions: any[], answers: any[], field: string) {
  const map = new Map<string, any[]>();
  for (const session of sessions.filter((item) => item.completed)) {
    const key = String(session[field] ?? "Не указано").trim() || "Не указано";
    map.set(key, [...(map.get(key) ?? []), session]);
  }
  return [...map.entries()].map(([group, rows]) => ({ title, group, count: rows.length, average: sessionAverage(new Set(rows.map((row) => row.id)), answers), reliability: rows.length < 3 ? "мало ответов" : "можно анализировать" }));
}

function xmlEscape(value: CellValue): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function colName(index: number): string {
  let name = "";
  while (index > 0) { const mod = (index - 1) % 26; name = String.fromCharCode(65 + mod) + name; index = Math.floor((index - mod) / 26); }
  return name;
}

function readCell(cellValue: Cell): { value: CellValue; style: number } {
  if (typeof cellValue === "object" && cellValue !== null && "value" in cellValue) return { value: cellValue.value, style: cellValue.style ?? STYLE.normal };
  return { value: cellValue, style: STYLE.normal };
}

function worksheetXml(sheet: SheetSpec): string {
  const cols = sheet.columns.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}" ht="${rowIndex === 0 ? 28 : 36}" customHeight="1">${row.map((rawCell, colIndex) => {
    const c = readCell(rawCell);
    const ref = `${colName(colIndex + 1)}${rowIndex + 1}`;
    if (typeof c.value === "number") return `<c r="${ref}" s="${c.style}"><v>${c.value}</v></c>`;
    return `<c r="${ref}" s="${c.style}" t="inlineStr"><is><t>${xmlEscape(c.value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
  const view = sheet.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}<cols>${cols}</cols><sheetData>${rows}</sheetData>${autoFilter}${merges}</worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="6"><font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF991B1B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF92400E"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF166534"/><name val="Calibri"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path);
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const crc = crc32(content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28); name.copy(local, 30);
    locals.push(local, content);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42); name.copy(central, 46);
    centrals.push(central);
    offset += local.length + content.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function buildXlsx(sheets: SheetSpec[]): Buffer {
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const rels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const files = [
    { path: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>` },
    { path: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { path: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
    { path: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { path: "xl/styles.xml", content: stylesXml() },
    ...sheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) }))
  ];
  return zip(files);
}

function tableSheet(name: string, headers: string[], rows: Cell[][], widths: number[]): SheetSpec {
  return { name, columns: widths, rows: [[...headers.map((header) => cell(header, STYLE.header))], ...rows], freeze: true, autoFilter: `A1:${colName(headers.length)}${Math.max(1, rows.length + 1)}` };
}

export async function buildSurveyWorkbook(surveyId: string): Promise<Buffer> {
  await ensureSchema();
  const sql = getSql();
  const surveys = await sql`SELECT id,title,description,status FROM hr_surveys WHERE id=${surveyId}` as any[];
  const survey = surveys[0];
  if (!survey) throw new Error("Опрос не найден");
  const questions = await sql`SELECT id,survey_id,position,code,text,category,type,options,required,max_choices FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as any[];
  const sessions = await sql`SELECT id,survey_id,employee_group,employee_role,tenure,store_or_department,completed,current_question_position,started_at,completed_at,attempt_no FROM hr_survey_sessions WHERE survey_id=${surveyId} ORDER BY started_at` as any[];
  const answers = await sql`SELECT id,session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json,created_at FROM hr_survey_answers WHERE survey_id=${surveyId} ORDER BY created_at,id` as any[];
  const sessionsById = new Map<string, any>(sessions.map((session) => [session.id, session]));
  const completed = sessions.filter((session) => session.completed).length;
  const started = sessions.length;
  const qStats = questionStats(questions, answers);
  const cStats = categoryStats(qStats);
  const pStats = problemStats(answers, completed);
  const comments = commentRows(answers, sessionsById);
  const average = sessionAverage(new Set(sessions.map((session) => session.id)), answers);
  const redZones = cStats.filter((item) => item.zone === "red").length;
  const yellowZones = cStats.filter((item) => item.zone === "yellow").length;
  const weakQuestions = qStats.filter((item) => item.average !== null).sort((left, right) => (left.average ?? 99) - (right.average ?? 99));

  const dashboardRows: Cell[][] = [
    [cell(`HR-опрос: ${survey.title}`, STYLE.title), "", "", "", "", "", "", ""],
    [cell(`Статус: ${survey.status} · Выгрузка: ${new Date().toLocaleString("ru-RU")}. Открывайте этот лист первым: здесь выводы и действия.`, STYLE.note), "", "", "", "", "", "", ""],
    [],
    [cell("Анкет начато", STYLE.kpi), cell(started, STYLE.kpi), cell("Завершено", STYLE.kpi), cell(completed, STYLE.kpi), cell("Средний балл", STYLE.kpi), cell(average ?? "нет данных", STYLE.kpi), cell("eNPS", STYLE.kpi), cell(enps(answers), STYLE.kpi)],
    [cell("Завершение", STYLE.kpi), cell(started ? pct(completed / started) : "0%", STYLE.kpi), cell("Красные зоны", STYLE.kpi), redZones ? red(redZones) : green(0), cell("Жёлтые зоны", STYLE.kpi), yellowZones ? yellow(yellowZones) : green(0), cell("Комментариев", STYLE.kpi), cell(comments.length, STYLE.kpi)],
    [],
    [cell("Общий вывод", STYLE.section), "", "", "", cell("Первые действия HR", STYLE.section), "", "", ""],
    [byZone(average === null ? "Пока нет числовых ответов." : average < 3.2 ? "Общая удовлетворенность в красной зоне. Нужен разбор причин с HR и руководителями." : average <= 3.8 ? "Есть зоны напряжения. Начните со слабых вопросов и частых проблем." : "Общая оценка нормальная. Проверьте локальные проблемы и комментарии.", average === null ? "normal" : average < 3.2 ? "red" : average <= 3.8 ? "yellow" : "normal"), "", "", "", cell("1. Разобрать лист План действий.\n2. Назначить ответственных по P1.\n3. Проверить комментарии с отметкой Внимание = Да.", STYLE.note), "", "", ""],
    [],
    [cell("Топ проблем", STYLE.section), cell("Выборов", STYLE.section), cell("Доля", STYLE.section), cell("Зона", STYLE.section), cell("Самые слабые вопросы", STYLE.section), cell("Балл", STYLE.section), cell("Зона", STYLE.section), cell("Что делать", STYLE.section)],
    ...Array.from({ length: Math.max(7, Math.min(10, Math.max(pStats.length, weakQuestions.length))) }, (_, index) => {
      const problem = pStats[index];
      const question = weakQuestions[index];
      return [problem?.option ?? "", problem?.count ?? "", problem ? pct(problem.share) : "", problem ? byZone(zoneLabel(problem.zone), problem.zone) : "", question?.question ?? "", question?.average ?? "", question ? byZone(zoneLabel(question.zone), question.zone) : "", question ? CATEGORY_HELP[question.category]?.action ?? "Разобрать вручную" : ""];
    })
  ];

  const actionRows: Cell[][] = [
    ...qStats.filter((item) => item.type === "scale_1_5" && item.zone !== "normal").map((item, index) => [item.zone === "red" ? `P1-${index + 1}` : `P2-${index + 1}`, byZone(zoneLabel(item.zone), item.zone), "низкая оценка", item.categoryLabel, item.question, item.average ?? "", pct(item.lowShare), item.count, conclusion(item.zone), CATEGORY_HELP[item.category]?.action ?? "Разобрать вручную", "", "Новая", ""]),
    ...pStats.filter((item) => item.zone !== "normal").map((item, index) => [item.zone === "red" ? `P1-П${index + 1}` : `P2-П${index + 1}`, byZone(zoneLabel(item.zone), item.zone), "частый выбор", "Проблемы", item.option, "", "", item.count, item.check, item.action, "", "Новая", ""])
  ];

  const answersBySession = new Map<string, Map<string, any>>();
  for (const answer of answers) { const map = answersBySession.get(answer.session_id) ?? new Map<string, any>(); map.set(answer.question_code, answer); answersBySession.set(answer.session_id, map); }

  return buildXlsx([
    { name: "Дашборд HR", columns: [28, 12, 18, 12, 34, 12, 12, 48], rows: dashboardRows, merges: ["A1:H1", "A2:H2", "A8:D8", "E8:H8"], freeze: false },
    tableSheet("План действий", ["Приоритет", "Зона", "Тип", "Категория", "Проблема", "Балл", "Низкие", "Ответов", "Вывод", "Действие", "Ответственный", "Статус", "Комментарий HR"], actionRows, [12, 14, 16, 22, 48, 10, 12, 10, 42, 42, 18, 14, 30]),
    tableSheet("Вопросы", ["№", "Категория", "Вопрос", "Ответов", "Балл", "1", "2", "3", "4", "5", "Низкие", "Высокие", "Зона", "Что делать"], qStats.map((item) => [item.position, item.categoryLabel, item.question, item.count, item.average ?? "", item.counts[1] ?? 0, item.counts[2] ?? 0, item.counts[3] ?? 0, item.counts[4] ?? 0, item.counts[5] ?? 0, item.type === "scale_1_5" ? pct(item.lowShare) : "", item.type === "scale_1_5" ? pct(item.highShare) : "", item.type === "scale_1_5" ? byZone(zoneLabel(item.zone), item.zone) : "", CATEGORY_HELP[item.category]?.action ?? "Разобрать вручную"]), [6, 24, 58, 10, 10, 6, 6, 6, 6, 6, 12, 12, 12, 44]),
    tableSheet("Категории", ["Категория", "Балл", "Ответов", "Низкие", "Зона", "Что означает", "Что делать"], cStats.map((item) => [item.label, item.average ?? "", item.count, pct(item.lowShare), byZone(zoneLabel(item.zone), item.zone), item.meaning, item.action]), [26, 10, 10, 12, 12, 50, 50]),
    tableSheet("Проблемы", ["Проблема", "Выборов", "Доля", "Зона", "Что проверить", "Рекомендуемое действие"], pStats.map((item) => [item.option, item.count, pct(item.share), byZone(zoneLabel(item.zone), item.zone), item.check, item.action]), [34, 10, 10, 12, 52, 52]),
    tableSheet("Комментарии", ["Дата", "Анкета", "Группа", "Роль", "Стаж", "Магазин/отдел", "Тип", "Комментарий", "Тема", "Внимание", "Комментарий HR"], comments.map((item) => [item.createdAt, item.sessionId, item.employeeGroup, item.employeeRole, item.tenure, item.store, item.type, item.comment, item.topic, item.attention === "Да" ? red("Да") : green("Нет"), ""]), [18, 12, 16, 18, 16, 20, 18, 70, 20, 12, 28]),
    tableSheet("Срезы", ["Срез", "Группа", "Анкет", "Средний балл", "Надёжность"], [...sliceRows("Место работы", sessions, answers, "employee_group"), ...sliceRows("Роль", sessions, answers, "employee_role"), ...sliceRows("Стаж", sessions, answers, "tenure"), ...sliceRows("Магазин/отдел", sessions, answers, "store_or_department")].map((item) => [item.title, item.group, item.count, item.average ?? "", item.reliability === "мало ответов" ? yellow(item.reliability) : green(item.reliability)]), [18, 30, 10, 14, 20]),
    tableSheet("Анкеты", ["Анкета", "Попытка", "Начало", "Завершение", "Группа", "Роль", "Стаж", "Магазин/отдел", "Статус", "Средний балл", "Что мешает", "Что улучшить", "Комментарий"], sessions.map((session) => { const map = answersBySession.get(session.id) ?? new Map<string, any>(); return [anonSessionId(session.id), session.attempt_no ?? "", asDate(session.started_at), asDate(session.completed_at), session.employee_group ?? "", session.employee_role ?? "", session.tenure ?? "", session.store_or_department ?? "", session.completed ? green("завершена") : yellow("в процессе"), sessionAverage(new Set([session.id]), answers) ?? "", answerText(map.get("blockers")), answerText(map.get("improvements")), answerText(map.get("one_change"))]; }), [12, 10, 18, 18, 16, 18, 16, 20, 14, 12, 40, 40, 52]),
    tableSheet("Детальные ответы", ["Дата", "Анкета", "Попытка", "Группа", "Роль", "Категория", "Код", "Вопрос", "Ответ", "Балл"], answers.map((answer) => { const session = sessionsById.get(answer.session_id); return [asDate(answer.created_at), anonSessionId(answer.session_id), session?.attempt_no ?? "", session?.employee_group ?? "", session?.employee_role ?? "", categoryLabel(answer.category), answer.question_code, answer.question_text, answerText(answer), asNumber(answer.answer_number) ?? ""]; }), [18, 12, 10, 16, 18, 22, 12, 58, 52, 10])
  ]);
}
