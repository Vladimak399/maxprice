export type ForecastUploadType = "plan_fact" | "period_comparison" | "sales_analysis";

export function detectForecastUploadType(filename: string): ForecastUploadType | null {
  const value = filename.toLowerCase().replace(/ё/g, "е");
  if (!/\.xlsx$/i.test(value)) return null;
  if (/сравнен.*прошл|прошл.*период/.test(value)) return "period_comparison";
  if (/продаж.*анализ/.test(value)) return "sales_analysis";
  if (/план[\s_-]*факт|(^|[\s_-])факт([\s_.-]|$)/.test(value)) return "plan_fact";
  return null;
}

export function uploadTypeLabel(type: ForecastUploadType): string {
  if (type === "plan_fact") return "план-факт";
  if (type === "period_comparison") return "сравнение с прошлым периодом";
  return "продажи с анализом";
}
