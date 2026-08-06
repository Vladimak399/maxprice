export type ComparisonMetricLine = {
  name: string;
  parentCategory: string | null;
  previousRevenue: number;
  previousMargin: number;
  previousStockQty: number;
  previousStockValue: number;
  currentRevenue: number;
  currentMargin: number;
  currentStockQty: number;
  currentStockValue: number;
  revenueDelta: number;
  marginDelta: number;
  revenueGrowth: number | null;
  marginGrowth: number | null;
};

export type PeriodComparisonSummary = {
  type: "period_comparison";
  filename: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  categories: ComparisonMetricLine[];
  subcategories: ComparisonMetricLine[];
};

export type SalesAggregateLine = {
  name: string;
  parentCategory: string | null;
  previousRevenue: number;
  previousMargin: number;
  previousUnits: number;
  previousStock: number;
  currentRevenue: number;
  currentMargin: number;
  currentUnits: number;
  currentStock: number;
  currentStockValue: number;
  revenueDelta: number;
  marginDelta: number;
};

export type SalesItemCandidate = SalesAggregateLine & {
  category: string;
  subcategory: string | null;
  storesSoldCurrent: number;
  storesStockCurrent: number;
  stockDays: number | null;
};

export type SalesAnalysisSummary = {
  type: "sales_analysis";
  filename: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  itemCount: number;
  categories: SalesAggregateLine[];
  subcategories: SalesAggregateLine[];
  returnCandidates: SalesItemCandidate[];
  stockWithoutSales: SalesItemCandidate[];
  overstock: SalesItemCandidate[];
  newItems: SalesItemCandidate[];
};

export type SupportingReportSummary = PeriodComparisonSummary | SalesAnalysisSummary;

export type StoredSupportingReport = {
  id: number;
  sourceUserId: string;
  sourceChatId: string | null;
  reportType: SupportingReportSummary["type"];
  reportDate: string;
  filename: string;
  createdAt: string;
  summary: SupportingReportSummary;
};
