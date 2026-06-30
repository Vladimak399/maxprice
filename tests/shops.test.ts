import { describe, expect, it } from "vitest";
import { detectShopInLine, listCanonicalShops } from "../src/parser/shops.js";

describe("detectShopInLine", () => {
  it("определяет магазин по отдельной строке", () => {
    expect(detectShopInLine("Баграт")).toBe("Багратионовск");
  });

  it("определяет магазин по фразе", () => {
    expect(detectShopInLine("изменилась цена в Баграте")).toBe("Багратионовск");
  });

  it("определяет Советск 2", () => {
    expect(detectShopInLine("Советск2")).toBe("Советск 2");
  });

  it("определяет Маркса по разным написаниям", () => {
    expect(detectShopInLine("К.Маркса")).toBe("Маркса");
    expect(detectShopInLine("Карла Маркса")).toBe("Маркса");
  });

  it("не путает товарную строку с магазином без явного паттерна", () => {
    const line = "Цена товара: Конфеты Мега вкусные, (120), отличается от текущей закупочной цены - 100";
    expect(detectShopInLine(line)).toBeNull();
  });

  it("возвращает список магазинов", () => {
    expect(listCanonicalShops()).toContain("Багратионовск");
    expect(listCanonicalShops()).toContain("Экватор");
  });
});
