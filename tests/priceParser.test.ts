import { describe, expect, it } from "vitest";
import { parsePriceMessage } from "../src/parser/priceParser.js";

const sampleMessage = `
Баграт
Цена товара: Мак Изд Гранд ди Паста Фузилли Спирали 450г 1/12, (74,29), отличается то текущей закупочной цены - 58,37
Цена товара: Кофе Монарх 3в1 растворим Mild 13.5г 1/24, (10,34), отличается то текущей закупочной цены - 12,61
Цена товара: Мак изд Макфа Бабочки 400г 1/20, (66,84), отличается то текущей закупочной цены - 0

Светлый
Цена товара: Чай Пример 100г 1/12, (130), отличается от текущей закупочной цены - 100
`;

describe("parsePriceMessage", () => {
  it("игнорирует снижение цены", () => {
    const result = parsePriceMessage(sampleMessage);
    expect(result.growthItems.some((item) => item.name.includes("Кофе Монарх"))).toBe(false);
  });

  it("добавляет рост цены в growthItems", () => {
    const result = parsePriceMessage(sampleMessage);
    const item = result.growthItems.find((entry) => entry.name.includes("Фузилли"));

    expect(item).toBeDefined();
    expect(item?.shop).toBe("Багратионовск");
    expect(item?.oldPrice).toBe(58.37);
    expect(item?.newPrice).toBe(74.29);
    expect(item?.diff).toBe(15.92);
    expect(item?.percent).toBe(27.3);
  });

  it("добавляет oldPrice = 0 в zeroPriceItems", () => {
    const result = parsePriceMessage(sampleMessage);
    expect(result.zeroPriceItems).toHaveLength(1);
    expect(result.zeroPriceItems[0]?.name).toContain("Макфа Бабочки");
  });

  it("игнорирует рост цены меньше 1 рубля", () => {
    const result = parsePriceMessage("Цена товара: Товар с погрешностью, (100,99), отличается от текущей закупочной цены - 100");
    expect(result.growthItems).toHaveLength(0);
  });

  it("добавляет рост цены ровно от 1 рубля", () => {
    const result = parsePriceMessage("Цена товара: Товар с ростом, (101), отличается от текущей закупочной цены - 100");
    expect(result.growthItems).toHaveLength(1);
    expect(result.growthItems[0]?.diff).toBe(1);
  });

  it("корректно привязывает товары к двум магазинам внутри одного сообщения", () => {
    const result = parsePriceMessage(sampleMessage);
    const tea = result.growthItems.find((entry) => entry.name.includes("Чай Пример"));

    expect(tea).toBeDefined();
    expect(tea?.shop).toBe("Светлый");
  });

  it("ставит магазин не указан, если магазин не найден", () => {
    const result = parsePriceMessage("Цена товара: Товар X, (120), отличается от текущей закупочной цены - 100");
    expect(result.growthItems[0]?.shop).toBe("магазин не указан");
  });

  it("парсит цену с пробелом", () => {
    const result = parsePriceMessage("Нестеров\nЦена товара: Кофе Пьяцца 1кг, (1 200,00), отличается от текущей закупочной цены - 1 137,54");
    expect(result.growthItems[0]?.oldPrice).toBe(1137.54);
    expect(result.growthItems[0]?.newPrice).toBe(1200);
  });

  it("парсит опечатку 'отличается то текущей закупочной цены'", () => {
    const result = parsePriceMessage("Мега\nЦена товара: Товар Y, (130), отличается то текущей закупочной цены - 100");
    expect(result.growthItems).toHaveLength(1);
  });

  it("парсит товар с запятыми в названии", () => {
    const result = parsePriceMessage("Оазис\nЦена товара: Соус, деликатесный, Манго-Чили 230г, (80), отличается от текущей закупочной цены - 70");
    expect(result.growthItems[0]?.name).toBe("Соус, деликатесный, Манго-Чили 230г");
  });
});
