export interface SeriesItem {
  key: string;
  label: string;
  type?: string;
}

export interface ChartSpec {
  chart_type: string;
  title: string;
  x_axis: string;
  series: SeriesItem[];
}

export interface ApiResponse {
  status: string;
  row_count: number;
  chart_spec: ChartSpec;
  data: Record<string, any>[];
}

export interface QueryRequest {
  sql: string;
  chart_spec?: ChartSpec;
}