import { sendMessage } from "../max/client";
import type { ExtractedMaxUpdate, MaxAttachment, MaxMessageButton } from "../types/max";
import { productSupplierManagers, productSupplierOperators, productSuppliers, type ProductSupplier } from "./productSuppliersData";

const PRODUCTS = "Продукты";
const SUPPLIERS = "Поставщики продуктов";
const FIND_SUPPLIER = "Найти поставщика";
const MANAGERS = "Ответственные менеджеры";
const OPERATORS = "Операторы";
const RETURNS = "Возвраты поставщикам";
const SHIPMENTS = "Отгрузки поставщиков";
const BACK = "База знаний";

function target(update: ExtractedMaxUpdate): { chatId?: string; userId?: string } {
  if (update.chatId) return { chatId: update.chatId };
  if (update.userId) return { userId: update.userId };
  return {};
}

function keyboard(rows: string[][]): MaxAttachment[] {
  return [{ type: "inline_keyboard", payload: { buttons: rows.map((row) => row.map((text): MaxMessageButton => ({ type: "message", text }))) } }];
}

function norm(value: string): string {
  return value.toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\b(ооо|оао|ао|ип|тд|тк|гк|пп)\b/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuery(text: string): string {
  return norm(text
    .replace(/^(контакты|возвраты|возврат|отгрузка|отгрузки|юрлица|старые названия)\s*:?\s*/i, "")
    .replace(/^(поставщики менеджера|поставщики оператора|написать менеджеру|написать оператору)\s*:?\s*/i, "")
    .replace(/\b(кто|какой|какая|какие|у|по|для|про|поставщик|поставщика|менеджер|оператор|отгрузка|отгрузки|возврат|возвраты|условия|доставляет|забирает|номер|телефон|контакт)\b/gi, " "));
}

function supplierSearchBlob(supplier: ProductSupplier): string {
  return norm([supplier.name, supplier.id, ...supplier.legalEntities, ...supplier.oldNames, ...supplier.searchTerms].join(" "));
}

export function findProductSuppliers(query: string, limit = 5): ProductSupplier[] {
  const cleaned = cleanQuery(query);
  if (cleaned.length < 2) return [];
  const tokens = cleaned.split(" ").filter((token) => token.length >= 2);
  if (!tokens.length) return [];
  return productSuppliers
    .map((supplier) => {
      const blob = supplierSearchBlob(supplier);
      const name = norm(supplier.name);
      let score = 0;
      if (name === cleaned) score += 100;
      if (blob.includes(cleaned)) score += 40;
      for (const token of tokens) if (blob.includes(token)) score += 10;
      return { supplier, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.supplier.name.localeCompare(right.supplier.name, "ru"))
    .slice(0, limit)
    .map((item) => item.supplier);
}

export function isProductKnowledgeIntent(text: string): boolean {
  const raw = text.trim();
  const normalized = norm(raw);
  if (!raw) return false;
  if (["продукты", "категория продукты", "продукты питания", "поставщики", "поставщики продуктов", "справочник поставщиков", norm(FIND_SUPPLIER), "ответственные менеджеры", "менеджеры", "по менеджеру", "операторы", "по оператору", "возвраты поставщикам", "возвраты", "возврат поставщикам", "отгрузки поставщиков", "отгрузки", "график отгрузки"].includes(normalized)) return true;
  if (/^(контакты|возвраты|отгрузка|юрлица|старые названия)\s*:/i.test(raw)) return true;
  if (/^(написать менеджеру|написать оператору|поставщики менеджера|поставщики оператора)/i.test(raw)) return true;
  if (findProductSuppliers(raw, 1).length > 0) return true;
  return /поставщик|поставщика|возврат|отгруз|менеджер|оператор/i.test(raw) && /продукт|продукты|товар/i.test(raw);
}

function shortName(name: string): string {
  return name.length > 52 ? `${name.slice(0, 49)}...` : name;
}

function supplierButtons(supplier: ProductSupplier): string[][] {
  const name = shortName(supplier.name);
  return [[`Контакты: ${name}`], [`Возвраты: ${name}`, `Отгрузка: ${name}`], [`Юрлица: ${name}`, `Старые названия: ${name}`], [SUPPLIERS, "Выйти из опроса"]];
}

function formatSupplierCard(supplier: ProductSupplier): string {
  return [
    supplier.name,
    `Статус: ${supplier.status}`,
    `Категория: ${supplier.categories.length ? supplier.categories.join(", ") : "Нет данных"}`,
    `Менеджер: ${supplier.manager} (${supplier.managerPhone})`,
    `Оператор: ${supplier.operator} (${supplier.operatorPhone})`,
    `График отгрузки: ${supplier.shipment}`,
    `Доставка: ${supplier.delivery}`,
    `Возвраты: ${supplier.returnPickup}`,
    `Сроки по возвратам: ${supplier.returnDeadline}`,
    `Условия возврата: ${supplier.returnConditions}`
  ].join("\n");
}

function formatContacts(supplier: ProductSupplier): string {
  return [`Контакты по поставщику: ${supplier.name}`, `Менеджер: ${supplier.manager}`, `Телефон менеджера: ${supplier.managerPhone}`, `Оператор: ${supplier.operator}`, `Телефон оператора: ${supplier.operatorPhone}`].join("\n");
}

function formatReturns(supplier: ProductSupplier): string {
  return [`Возвраты по поставщику: ${supplier.name}`, `Как забирает: ${supplier.returnPickup}`, `Когда передавать информацию: ${supplier.returnDeadline}`, `Условия возврата: ${supplier.returnConditions}`].join("\n");
}

function formatShipment(supplier: ProductSupplier): string {
  return [`Отгрузка по поставщику: ${supplier.name}`, `График: ${supplier.shipment}`, `Кто доставляет: ${supplier.delivery}`].join("\n");
}

function formatLegal(supplier: ProductSupplier): string {
  return [`Юрлица поставщика: ${supplier.name}`, supplier.legalEntities.length ? supplier.legalEntities.map((item) => `• ${item}`).join("\n") : "Нет данных"].join("\n");
}

function formatOldNames(supplier: ProductSupplier): string {
  return [`Старые названия / алиасы: ${supplier.name}`, supplier.oldNames.length ? supplier.oldNames.map((item) => `• ${item}`).join("\n") : "Нет данных"].join("\n");
}

async function sendProductsMenu(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(target(update), "Раздел: Продукты\n\nВыберите, что нужно найти.", {
    attachments: keyboard([[SUPPLIERS], [MANAGERS, OPERATORS], [RETURNS, SHIPMENTS], [BACK, "Выйти из опроса"]])
  });
}

async function sendSuppliersMenu(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(target(update), "Поставщики продуктов\n\nМожно нажать кнопку или написать часть названия поставщика. Например: Юринат, КДВ, Балт Хорс, Алиди.", {
    attachments: keyboard([[FIND_SUPPLIER], [MANAGERS, OPERATORS], [RETURNS, SHIPMENTS], [PRODUCTS, BACK]])
  });
}

async function sendManagers(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(target(update), "Ответственные менеджеры по поставщикам продуктов.", {
    attachments: keyboard([...productSupplierManagers.map((manager) => [`Написать менеджеру: ${manager.name.split(" ")[0]}`]), [SUPPLIERS, PRODUCTS]])
  });
}

async function sendOperators(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(target(update), "Операторы по поставщикам продуктов.", {
    attachments: keyboard([...productSupplierOperators.map((operator) => [`Написать оператору: ${operator.name.split(" ")[0]}`]), [SUPPLIERS, PRODUCTS]])
  });
}

function findPersonByButton(text: string, type: "manager" | "operator") {
  const query = norm(text.replace(/^написать (менеджеру|оператору)\s*:?\s*/i, ""));
  const people = type === "manager" ? productSupplierManagers : productSupplierOperators;
  return people.find((person) => norm(person.name).includes(query) || norm(person.name.split(" ")[0] ?? "") === query) ?? null;
}

async function sendPersonContact(update: ExtractedMaxUpdate, type: "manager" | "operator"): Promise<boolean> {
  const person = findPersonByButton(update.text, type);
  if (!person) return false;
  const suppliers = productSuppliers.filter((supplier) => type === "manager" ? supplier.manager === person.name : supplier.operator === person.name);
  const role = type === "manager" ? "менеджер" : "оператор";
  const title = type === "manager" ? "Менеджер" : "Оператор";
  await sendMessage(target(update), `${title}: ${person.name}\nТелефон: ${person.phone}\nПоставщиков: ${suppliers.length}\n\nЧтобы написать в MAX, найдите контакт по номеру телефона или имени.`, {
    attachments: keyboard([[`Поставщики ${role}: ${person.name.split(" ")[0]}`], [SUPPLIERS, PRODUCTS]])
  });
  return true;
}

async function sendPersonSuppliers(update: ExtractedMaxUpdate, type: "manager" | "operator"): Promise<boolean> {
  const query = norm(update.text.replace(/^поставщики (менеджера|оператора)\s*:?\s*/i, ""));
  const people = type === "manager" ? productSupplierManagers : productSupplierOperators;
  const person = people.find((item) => norm(item.name).includes(query) || norm(item.name.split(" ")[0] ?? "") === query);
  if (!person) return false;
  const suppliers = productSuppliers.filter((supplier) => type === "manager" ? supplier.manager === person.name : supplier.operator === person.name);
  const list = suppliers.map((supplier, index) => `${index + 1}. ${supplier.name}`).join("\n");
  await sendMessage(target(update), `Поставщики: ${person.name}\n\n${list}`, {
    attachments: keyboard([[FIND_SUPPLIER], [MANAGERS, OPERATORS], [SUPPLIERS]])
  });
  return true;
}

async function sendPrompt(update: ExtractedMaxUpdate, mode: "find" | "returns" | "shipment"): Promise<void> {
  const text = mode === "returns"
    ? "Напишите название поставщика, и я покажу правила возврата. Например: Юринат или Балт Хорс."
    : mode === "shipment"
      ? "Напишите название поставщика, и я покажу график отгрузки и доставку. Например: КДВ или Метро."
      : "Напишите часть названия поставщика. Например: Юринат, КДВ, Балт Хорс, Алиди.";
  await sendMessage(target(update), text, { attachments: keyboard([[SUPPLIERS, PRODUCTS]]) });
}

async function sendSupplierResult(update: ExtractedMaxUpdate, supplier: ProductSupplier, mode: "card" | "contacts" | "returns" | "shipment" | "legal" | "oldNames" = "card"): Promise<void> {
  const text = mode === "contacts" ? formatContacts(supplier)
    : mode === "returns" ? formatReturns(supplier)
      : mode === "shipment" ? formatShipment(supplier)
        : mode === "legal" ? formatLegal(supplier)
          : mode === "oldNames" ? formatOldNames(supplier)
            : formatSupplierCard(supplier);
  await sendMessage(target(update), text, { attachments: keyboard(supplierButtons(supplier)) });
}

async function sendSearchResults(update: ExtractedMaxUpdate, matches: ProductSupplier[]): Promise<void> {
  if (matches.length === 1) { await sendSupplierResult(update, matches[0]!); return; }
  await sendMessage(target(update), `Нашёл несколько поставщиков. Выберите нужного:\n\n${matches.map((supplier, index) => `${index + 1}. ${supplier.name}`).join("\n")}`, {
    attachments: keyboard([...matches.slice(0, 8).map((supplier) => [shortName(supplier.name)]), [FIND_SUPPLIER, SUPPLIERS]])
  });
}

function supplierFromButton(text: string): { supplier: ProductSupplier | null; mode: "contacts" | "returns" | "shipment" | "legal" | "oldNames" | "card" } {
  const lower = text.toLowerCase();
  const mode = lower.startsWith("контакты:") ? "contacts" : lower.startsWith("возвраты:") ? "returns" : lower.startsWith("отгрузка:") ? "shipment" : lower.startsWith("юрлица:") ? "legal" : lower.startsWith("старые названия:") ? "oldNames" : "card";
  const matches = findProductSuppliers(text, 1);
  return { supplier: matches[0] ?? null, mode };
}

export async function handleProductSuppliersUpdate(update: ExtractedMaxUpdate): Promise<boolean> {
  const text = update.text.trim();
  const normalized = norm(text);
  if (!text) return false;

  if (["продукты", "категория продукты", "продукты питания"].includes(normalized)) { await sendProductsMenu(update); return true; }
  if (["поставщики", "поставщики продуктов", "справочник поставщиков"].includes(normalized)) { await sendSuppliersMenu(update); return true; }
  if (normalized === norm(FIND_SUPPLIER)) { await sendPrompt(update, "find"); return true; }
  if (["ответственные менеджеры", "менеджеры", "по менеджеру"].includes(normalized)) { await sendManagers(update); return true; }
  if (["операторы", "по оператору"].includes(normalized)) { await sendOperators(update); return true; }
  if (["возвраты поставщикам", "возвраты", "возврат поставщикам"].includes(normalized)) { await sendPrompt(update, "returns"); return true; }
  if (["отгрузки поставщиков", "отгрузки", "график отгрузки"].includes(normalized)) { await sendPrompt(update, "shipment"); return true; }

  if (normalized.startsWith("написать менеджеру")) return await sendPersonContact(update, "manager");
  if (normalized.startsWith("написать оператору")) return await sendPersonContact(update, "operator");
  if (normalized.startsWith("поставщики менеджера")) return await sendPersonSuppliers(update, "manager");
  if (normalized.startsWith("поставщики оператора")) return await sendPersonSuppliers(update, "operator");

  if (/^(контакты|возвраты|отгрузка|юрлица|старые названия)\s*:/i.test(text)) {
    const { supplier, mode } = supplierFromButton(text);
    if (supplier) { await sendSupplierResult(update, supplier, mode); return true; }
    await sendMessage(target(update), "Не нашёл поставщика. Напишите часть названия, например: Юринат, КДВ, Балт Хорс.", { attachments: keyboard([[FIND_SUPPLIER], [SUPPLIERS]]) });
    return true;
  }

  const matches = findProductSuppliers(text, 5);
  if (matches.length) {
    const wantsReturn = /возврат|возвраты|условия|срок/i.test(text);
    const wantsShipment = /отгруз|график|достав/i.test(text);
    const wantsContact = /менеджер|оператор|контакт|телефон|номер/i.test(text);
    if (matches.length === 1) { await sendSupplierResult(update, matches[0]!, wantsReturn ? "returns" : wantsShipment ? "shipment" : wantsContact ? "contacts" : "card"); return true; }
    await sendSearchResults(update, matches);
    return true;
  }

  if (/поставщик|поставщика|возврат|отгруз|менеджер|оператор/i.test(text) && /продукт|продукты|товар/i.test(text)) { await sendSuppliersMenu(update); return true; }
  return false;
}
