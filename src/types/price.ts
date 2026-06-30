export type PriceChangeItem = {
  name: string;
  shop: string;
  oldPrice: number;
  newPrice: number;
  diff?: number;
  percent?: number;
};

export type ParseResult = {
  growthItems: PriceChangeItem[];
  zeroPriceItems: PriceChangeItem[];
};

export type GroupedPriceChange = {
  name: string;
  shops: string[];
  oldPrice: number;
  newPrice: number;
  diff?: number;
  percent?: number;
  count: number;
};
