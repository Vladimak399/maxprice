export type IncomingMaxImage = {
  url: string;
  attachmentId?: string;
};

export type MarkedTableRow = {
  visibleIndex: number;
  sourceRowNumber: number | null;
  productCode: string | null;
  productName: string;
  receivedQuantity: number | null;
  orderedQuantity: number | null;
  markerRatio: number;
  ocrText: string;
};

export type UnorderedGoodsAnalysis = {
  counterparty: string | null;
  warehouse: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  ocrConfidence: number;
  visibleRows: number;
  markedRows: MarkedTableRow[];
  rawText: string;
};
