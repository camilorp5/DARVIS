export interface SeriesItem {
  key: string;
  label: string;
  type?: string;
}

export interface ChartSpec {
  chart_type: string;
  title: string;
  x_axis: string;
  x_axis_label?: string;
  y_axis_label?: string;
  x_axis_min?: number;
  x_axis_max?: number;
  y_axis_min?: number;
  y_axis_max?: number;
  series: SeriesItem[];
  radar_max?: number;
  size_key?: string;
  size_label?: string;
  label_key?: string;
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