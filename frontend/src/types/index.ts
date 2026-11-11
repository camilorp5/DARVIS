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
  low_key?: string;
  high_key?: string;
  ref_value?: number;
  ref_x_key?: string;
  ref_y_key?: string;
  highlight_key?: string;
  label_filter_key?: string;
  footer_key?: string;
  footer_label?: string;
  categories_top_down?: boolean;
}

export interface ApiResponse {
  status: string;
  row_count: number;
  chart_spec: ChartSpec;
  data: Record<string, any>[];
  generated_sql?: string;
  lectura?: string;
  kpis?: Indicador[];
}

export interface Indicador {
  id: string;
  titulo: string;
  valor: string;
  detalle: string;
}

export interface PanelResumen {
  id: string;
  titulo: string;
  pregunta: string;
  lectura: string;
}

export interface CasoGuiaResumen {
  status: string;
  kpis: Indicador[];
  paneles: PanelResumen[];
}

export interface QueryRequest {
  sql: string;
  chart_spec?: ChartSpec;
}