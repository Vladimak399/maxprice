import { describe, expect, it } from "vitest";
import type { ChatConfig } from "../src/config/chats";
import { formatWeeklyUnorderedGoodsReport, uniqueNotificationTargets } from "../src/unorderedGoods/weeklyReport";

describe("weekly unordered-goods report", () => {
  it("compares the week and shows rankings", () => {
    const text = formatWeeklyUnorderedGoodsReport({
      current: { events: 6, items: 10, excessQuantity: 120 },
      previous: { events: 4, items: 20, excessQuantity: 100 },
      suppliers: [{ counterparty: "Поставщик А", events: 3, items: 5, excessQuantity: 70 }],
      products: [{ productName: "Товар А", productCode: "4601", occurrences: 4, excessQuantity: 48 }],
      warehouses: [{ warehouse: "Батальная", events: 4, items: 7, excessQuantity: 90 }]
    });
    expect(text).toContain("рост 50%");
    expect(text).toContain("снижение 50%");
    expect(text).toContain("Поставщик А");
    expect(text).toContain("Батальная");
  });

  it("deduplicates notification destinations", () => {
    const configs: ChatConfig[] = [
      { chatId: "source-1", name: "A", mode: "price_changes", enabled: true, sendTo: "chat", targetChatId: "destination" },
      { chatId: "source-2", name: "B", mode: "unordered_goods", enabled: true, sendTo: "chat", targetChatId: "destination" },
      { chatId: "disabled", name: "C", mode: "price_changes", enabled: false, sendTo: "chat", targetChatId: "other" }
    ];
    expect(uniqueNotificationTargets(configs)).toEqual([{ chatId: "destination" }]);
  });
});
