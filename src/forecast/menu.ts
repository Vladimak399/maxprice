import type { MaxAttachment, MaxMessageButton } from "../types/max";
import { CATEGORY_BUTTONS, scopeTitle, type ReportScope } from "./scopes";

function message(text: string): MaxMessageButton {
  return { type: "message", text };
}

function keyboard(buttons: MaxMessageButton[][]): MaxAttachment[] {
  return [{ type: "inline_keyboard", payload: { buttons } }];
}

export function analyticsMainMenu(): MaxAttachment[] {
  return keyboard([
    [message("Общий отчёт"), message("Отчёт Влад")],
    [message("Отчёт Кристина"), message("Категории")],
    [message("Данные"), message("История")],
    [message("Погода"), message("Отправить отчёты в мониторинг")]
  ]);
}

export function analyticsCategoryMenu(): MaxAttachment[] {
  const rows: MaxMessageButton[][] = [];
  for (let index = 0; index < CATEGORY_BUTTONS.length; index += 2) {
    rows.push(CATEGORY_BUTTONS.slice(index, index + 2).map((item) => message(`Категория ${item.label}`)));
  }
  rows.push([message("Меню аналитики")]);
  return keyboard(rows);
}

export function reportMenu(scope: ReportScope): MaxAttachment[] {
  const publishText = scope.kind === "overall"
    ? "Опубликовать общий отчёт"
    : scope.kind === "manager"
      ? `Опубликовать ${scopeTitle(scope)}`
      : `Опубликовать категорию ${scope.category}`;
  return keyboard([
    [message(publishText)],
    [message("Категории"), message("Меню аналитики")]
  ]);
}
