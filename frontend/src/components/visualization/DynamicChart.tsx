'use client';

import React, { PointerEvent, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ApiResponse } from '@/types';

export type ChartType = 
  | 'bar' 
  | 'horizontal_bar' 
  | 'line' 
  | 'area' 
  | 'pie' 
  | 'doughnut' 
  | 'scatter' 
  | 'radar' 
  | 'gauge'
  | 'interval';

interface DynamicChartProps {
  response: ApiResponse;
  isDark?: boolean;
  compact?: boolean;
  // Lectura corta bajo el gráfico y acciones de la tarjeta (p. ej. "Detalles"); opcionales.
  lectura?: string;
  acciones?: React.ReactNode;
  onTitlePointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp?: () => void;
}

const PALETTE = [
  '#2563eb', '#38bdf8', '#6366f1', '#0ea5e9', '#0284c7',
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'
];

// Números con formato es-CO: punto de miles y coma decimal, hasta 3 decimales.
export const formatoCO = (valor: unknown): string => {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return String(valor ?? '');
  const [entero, fraccion] = String(Number(valor.toFixed(3))).split('.');
  const signo = entero.startsWith('-') ? '-' : '';
  const miles = entero.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}${miles}${fraccion ? `,${fraccion}` : ''}`;
};

// Nombre legible de una columna, p. ej. 'candidata' -> 'Candidata'.
const nombreDeCampo = (campo: string) => {
  const texto = campo.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export default function DynamicChart({
  response,
  isDark = false,
  compact = false,
  lectura,
  acciones,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
}: DynamicChartProps) {
  const { chart_spec, data } = response;

  const option = useMemo(() => {
    const textColor = isDark ? '#e2e8f0' : '#475569';
    const mutedColor = isDark ? '#aab8cc' : '#64748b';
    const axisColor = isDark ? '#475569' : '#cbd5e1';
    const splitColor = isDark ? '#263449' : '#f1f5f9';
    const tooltipBackground = isDark ? '#111827' : '#ffffff';
    const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
    const tooltipOutsideChart = {
      appendTo: 'body' as const,
      confine: false,
      extraCssText: 'z-index: 99999; max-width: min(320px, 85vw); white-space: normal; overflow-wrap: anywhere;',
      textStyle: { color: textColor, fontSize: compact ? 10 : 12 },
    };
    // 1. Filtrado defensivo de filas de encabezado
    const cleanData = data.filter(
      (item) => String(item[chart_spec.x_axis]).toUpperCase() !== chart_spec.x_axis.toUpperCase()
    );

    const categories = cleanData.map((item) => String(item[chart_spec.x_axis] ?? 'S/I'));
    const chartType = chart_spec.chart_type as ChartType;
    const xAxisLabel = chart_spec.x_axis_label || chart_spec.x_axis;
    const yAxisLabel = chart_spec.y_axis_label || chart_spec.series[0]?.label || '';
    const axisFontSize = compact ? 9 : 11;
    const categoryInterval = compact ? 'auto' as const : 0;
    const axisNameGap = compact ? 24 : 34;
    const hasLongCategory = categories.some((category) => category.length > 8);
    const formatCategory = (value: string) => value.length > 18 ? `${value.slice(0, 17)}…` : value;
    // Campos opcionales del caso guía: si el spec no los trae, cada tipo de gráfico se dibuja igual que antes.
    const highlightKey = chart_spec.highlight_key;
    const highlightColor = isDark ? '#fbbf24' : '#d97706';
    const highlightName = highlightKey ? nombreDeCampo(highlightKey) : '';
    const isHighlighted = (item: Record<string, any> | undefined) => Boolean(highlightKey && item?.[highlightKey]);
    // Las filas destacadas llevan además ★ y negrita en su etiqueta: el color no es la única señal.
    const categoryLabel = (value: string, index: number) =>
      isHighlighted(cleanData[index]) ? `{destacada|★ ${formatCategory(value)}}` : formatCategory(value);
    const categoryRich = { destacada: { fontWeight: 'bold' as const, color: textColor, fontSize: axisFontSize } };
    const barData = (key: string) => cleanData.map((item) => {
      const value = item[key] ?? 0;
      return isHighlighted(item) ? { value, itemStyle: { color: highlightColor } } : value;
    });

    // --- CASO 1: Gráficos Circulares (Pie / Dona) ---
    if (chartType === 'pie' || chartType === 'doughnut') {
      const primarySeries = chart_spec.series[0];
      const pieData = cleanData.map((item) => ({
        name: String(item[chart_spec.x_axis] ?? 'S/I'),
        value: Number(item[primarySeries?.key] ?? 0),
      }));

      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, textStyle: { color: textColor, fontWeight: '500', fontSize: axisFontSize } },
        color: PALETTE,
        series: [
          {
            name: primarySeries?.label || chart_spec.title,
            type: 'pie',
            radius: chartType === 'doughnut' ? ['40%', '70%'] : '65%',
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: isDark ? '#111827' : '#fff', borderWidth: 2 },
            label: { show: true, fontSize: axisFontSize, formatter: compact ? '{d}%' : '{b}: {d}%' },
            data: pieData,
          },
        ],
      };
    }

    // --- CASO 2: Gráfico de Dispersión (Scatterplot) ---
    if (chartType === 'scatter') {
      const primarySeries = chart_spec.series[0];
      const sizeKey = chart_spec.size_key;
      const labelKey = chart_spec.label_key;
      const labelFilterKey = chart_spec.label_filter_key;
      const refX = chart_spec.ref_x_key ? Number(cleanData[0]?.[chart_spec.ref_x_key]) : NaN;
      const refY = chart_spec.ref_y_key ? Number(cleanData[0]?.[chart_spec.ref_y_key]) : NaN;
      // Con campos del caso guía, los números se muestran en formato es-CO; sin ellos, igual que antes.
      const caseFields = Boolean(highlightKey || labelFilterKey || chart_spec.ref_x_key || chart_spec.ref_y_key || chart_spec.footer_key);
      const showNumber = (value: unknown) => (caseFields ? formatoCO(value) : value);
      const maxSize = sizeKey ? Math.max(0, ...cleanData.map((item) => Number(item[sizeKey]) || 0)) : 0;
      const pointSize = (value: any[]) => (sizeKey && maxSize > 0 ? Math.max(6, 40 * Math.sqrt(Number(value[2]) / maxSize)) : 10);
      const scatterData = cleanData.map((item) => {
        const value = [
          item[chart_spec.x_axis],
          item[primarySeries.key],
          sizeKey ? item[sizeKey] : null,
          labelKey ? item[labelKey] : null,
        ];
        if (!highlightKey && !labelFilterKey) return value;
        const highlighted = isHighlighted(item);
        const labelAllowed = labelFilterKey ? Boolean(item[labelFilterKey]) : true;
        return {
          value: [...value, highlighted ? 1 : 0],
          // Las destacadas: marcador más grande, otro color y etiqueta en negrita.
          ...(highlighted ? {
            symbolSize: Math.max(16, pointSize(value) * 1.5),
            itemStyle: { color: highlightColor, borderColor: isDark ? '#111827' : '#ffffff', borderWidth: 1.5 },
          } : {}),
          label: { show: Boolean(labelKey) && labelAllowed && (!compact || highlighted), fontWeight: highlighted ? 'bold' : 'normal' },
        };
      });
      const referenceLines = [
        ...(Number.isFinite(refX) ? [{ xAxis: refX, label: { formatter: `Mediana ${formatoCO(refX)}` } }] : []),
        ...(Number.isFinite(refY) ? [{ yAxis: refY, label: { formatter: `Mediana ${formatoCO(refY)}` } }] : []),
      ];

      return {
        textStyle: { color: textColor },
        tooltip: {
          ...tooltipOutsideChart,
          trigger: 'item',
          formatter: (params: any) => [
            params.value[3],
            `${xAxisLabel}: ${showNumber(params.value[0])}`,
            `${primarySeries.label}: ${showNumber(params.value[1])}`,
            sizeKey ? `${chart_spec.size_label || sizeKey}: ${showNumber(params.value[2])}` : null,
            params.value[4] === 1 ? highlightName : null,
          ].filter(Boolean).join('<br/>'),
        },
        grid: { top: compact ? '12%' : '15%', left: compact ? '14%' : '16%', right: '5%', bottom: compact ? '20%' : '18%', containLabel: true },
        xAxis: {
          type: 'value', min: chart_spec.x_axis_min, max: chart_spec.x_axis_max,
          name: xAxisLabel, nameLocation: 'middle', nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize, ...(caseFields ? { formatter: formatoCO } : {}) },
          axisLine: { lineStyle: { color: axisColor } },
        },
        yAxis: {
          type: 'value', min: chart_spec.y_axis_min, max: chart_spec.y_axis_max, scale: Boolean(sizeKey),
          name: chart_spec.y_axis_label || primarySeries.label, nameLocation: 'middle', nameRotate: 90, nameGap: compact ? 32 : 42,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize, ...(caseFields ? { formatter: formatoCO } : {}) },
          splitLine: { lineStyle: { color: splitColor } },
        },
        series: [
          {
            name: primarySeries.label,
            type: 'scatter',
            // El área del punto es proporcional al valor; sin size_key se mantiene el tamaño actual.
            symbolSize: sizeKey && maxSize > 0 ? (value: any[]) => Math.max(6, 40 * Math.sqrt(Number(value[2]) / maxSize)) : 10,
            label: { show: Boolean(labelKey) && !compact, formatter: (p: any) => p.value[3], position: 'top', color: textColor, fontSize: axisFontSize },
            itemStyle: { color: PALETTE[0] },
            data: scatterData,
            ...(referenceLines.length ? {
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color: mutedColor },
                label: { color: mutedColor, fontSize: axisFontSize },
                data: referenceLines,
              },
            } : {}),
          },
        ],
      };
    }

    // --- CASO 2b: Intervalo (punto con su intervalo y línea de referencia) ---
    if (chartType === 'interval') {
      const primarySeries = chart_spec.series[0];
      const lowKey = chart_spec.low_key || primarySeries.key;
      const highKey = chart_spec.high_key || primarySeries.key;
      const refValue = chart_spec.ref_value;
      const intervalData = cleanData.map((item, index) => [
        index,
        Number(item[lowKey]),
        Number(item[highKey]),
        Number(item[primarySeries.key]),
        isHighlighted(item) ? 1 : 0,
      ]);

      return {
        textStyle: { color: textColor },
        tooltip: {
          ...tooltipOutsideChart,
          trigger: 'item',
          formatter: (params: any) => [
            categories[params.value[0]],
            `${primarySeries.label}: ${formatoCO(params.value[3])}`,
            `Intervalo: ${formatoCO(params.value[1])} a ${formatoCO(params.value[2])}`,
            params.value[4] === 1 ? highlightName : null,
          ].filter(Boolean).join('<br/>'),
        },
        grid: { top: compact ? '10%' : '12%', left: compact ? '15%' : '17%', right: '6%', bottom: compact ? '20%' : '18%', containLabel: true },
        xAxis: {
          type: 'value', scale: true,
          name: chart_spec.y_axis_label || primarySeries.label, nameLocation: 'middle', nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize, formatter: formatoCO },
          splitLine: { lineStyle: { color: splitColor } },
        },
        yAxis: {
          type: 'category', data: categories, inverse: Boolean(chart_spec.categories_top_down),
          name: xAxisLabel, nameLocation: 'middle', nameRotate: 90, nameGap: compact ? 34 : 44,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: {
            color: mutedColor,
            fontSize: axisFontSize,
            interval: categoryInterval,
            overflow: 'truncate',
            width: compact ? 66 : 110,
            formatter: highlightKey ? categoryLabel : formatCategory,
            rich: categoryRich,
          },
          axisLine: { lineStyle: { color: axisColor } },
        },
        series: [
          {
            name: primarySeries.label,
            type: 'custom',
            encode: { x: [1, 2, 3], y: 0 },
            data: intervalData,
            // Barra del intervalo con topes, y el punto encima; las destacadas, más gruesas, más grandes y de otro color.
            renderItem: (_params: any, api: any) => {
              const category = api.value(0);
              const low = api.coord([api.value(1), category]);
              const high = api.coord([api.value(2), category]);
              const point = api.coord([api.value(3), category]);
              const highlighted = api.value(4) === 1;
              const color = highlighted ? highlightColor : PALETTE[0];
              const cap = Math.max(3, api.size([0, 1])[1] * 0.2);
              return {
                type: 'group',
                children: [
                  { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style: { stroke: color, lineWidth: highlighted ? 3 : 2 } },
                  { type: 'line', shape: { x1: low[0], y1: low[1] - cap, x2: low[0], y2: low[1] + cap }, style: { stroke: color, lineWidth: 2 } },
                  { type: 'line', shape: { x1: high[0], y1: high[1] - cap, x2: high[0], y2: high[1] + cap }, style: { stroke: color, lineWidth: 2 } },
                  { type: 'circle', shape: { cx: point[0], cy: point[1], r: highlighted ? 7 : 4.5 }, style: { fill: color, stroke: isDark ? '#111827' : '#ffffff', lineWidth: 1.5 } },
                ],
              };
            },
            ...(Number.isFinite(refValue) ? {
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color: mutedColor },
                label: { formatter: formatoCO(refValue), color: mutedColor, fontSize: axisFontSize },
                data: [{ xAxis: refValue }],
              },
            } : {}),
          },
        ],
      };
    }

    // --- CASO 3: Gráfico de Radar ---
    if (chartType === 'radar') {
      const maxVal = chart_spec.radar_max || 100;
      const indicator = categories.map((cat) => ({ name: cat, max: maxVal }));

      const seriesData = chart_spec.series.map((s) => ({
        value: cleanData.map((item) => Number(item[s.key] ?? 0)),
        name: s.label,
      }));

      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: textColor, fontSize: axisFontSize } },
        radar: { indicator, radius: '60%' },
        color: PALETTE,
        series: [{ type: 'radar', data: seriesData }],
      };
    }

    // --- CASO 4: Gráfico de Velocímetro (Gauge) ---
    if (chartType === 'gauge') {
      const primarySeries = chart_spec.series[0];
      const val = Number(cleanData[0]?.[primarySeries.key] ?? 0);

      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, formatter: '{a} <br/>{b} : {c}%' },
        series: [
          {
            name: primarySeries.label,
            type: 'gauge',
            progress: { show: true },
            detail: { valueAnimation: true, formatter: '{value}' },
            data: [{ value: val, name: primarySeries.label }],
          },
        ],
      };
    }

    // --- CASO 5: Cartesianos Específicos (Barras Horizontales) ---
    if (chartType === 'horizontal_bar') {
      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, trigger: 'axis', axisPointer: { type: 'shadow' }, ...(highlightKey ? { valueFormatter: formatoCO } : {}) },
        legend: { bottom: 0, textStyle: { color: textColor, fontSize: axisFontSize } },
        grid: { top: compact ? '12%' : '15%', left: compact ? '15%' : '17%', right: '5%', bottom: compact ? '20%' : '18%', containLabel: true },
        xAxis: {
          type: 'value', min: chart_spec.x_axis_min, max: chart_spec.x_axis_max,
          name: yAxisLabel, nameLocation: 'middle', nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize, ...(highlightKey ? { formatter: formatoCO } : {}) },
          splitLine: { lineStyle: { color: splitColor } },
        },
        yAxis: {
          type: 'category', data: categories, inverse: Boolean(chart_spec.categories_top_down),
          name: xAxisLabel, nameLocation: 'middle', nameRotate: 90, nameGap: compact ? 34 : 44,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: {
            color: mutedColor,
            fontSize: axisFontSize,
            interval: categoryInterval,
            hideOverlap: true,
            overflow: 'truncate',
            width: compact ? 66 : 110,
            formatter: highlightKey ? categoryLabel : formatCategory,
            ...(highlightKey ? { rich: categoryRich } : {}),
          },
          axisLine: { lineStyle: { color: axisColor } },
        },
        series: chart_spec.series.map((s, idx) => ({
          name: s.label,
          type: 'bar',
          data: barData(s.key),
          itemStyle: { color: PALETTE[idx % PALETTE.length], borderRadius: [0, 6, 6, 0] },
          ...(highlightKey ? { label: { show: true, position: 'right', formatter: (p: any) => formatoCO(p.value), color: textColor, fontSize: axisFontSize } } : {}),
        })),
      };
    }

    // --- CASO 6: Cartesianos Estándar (Barra, Línea, Área, Temporal) ---
    const isTimeSeries = categories.some((c) => !isNaN(Date.parse(c)) && c.length >= 4);

    return {
      textStyle: { color: textColor },
      tooltip: {
        ...tooltipOutsideChart,
        trigger: 'axis',
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: compact ? 10 : 12 },
        axisPointer: { type: chartType === 'line' || chartType === 'area' ? 'line' : 'shadow' },
      },
      legend: { bottom: 0, textStyle: { color: textColor, fontWeight: '500', fontSize: axisFontSize } },
      grid: { top: compact ? '12%' : '15%', left: compact ? '13%' : '15%', right: '5%', bottom: compact ? '20%' : '18%', containLabel: true },
      xAxis: [
        {
          type: isTimeSeries ? 'category' : 'category',
          data: categories,
          name: xAxisLabel,
          nameLocation: 'middle',
          nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: {
            color: mutedColor,
            fontWeight: '500',
            fontSize: axisFontSize,
            interval: categoryInterval,
            hideOverlap: true,
            rotate: hasLongCategory ? 40 : (!compact && categories.length > 8 ? 30 : 0),
            align: hasLongCategory ? 'right' : 'center',
            overflow: 'truncate',
            width: compact ? 72 : 125,
            formatter: formatCategory,
          },
        },
      ],
      yAxis: [
        {
          type: 'value',
          min: chart_spec.y_axis_min,
          max: chart_spec.y_axis_max,
          name: yAxisLabel,
          nameLocation: 'middle',
          nameRotate: 90,
          nameGap: compact ? 32 : 42,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          splitLine: { lineStyle: { color: splitColor } },
          axisLabel: { color: mutedColor, fontSize: axisFontSize },
        },
      ],
      series: chart_spec.series.map((s, idx) => {
        const effectiveType = (s.type as ChartType | undefined) || chartType;
        const isArea = effectiveType === 'area';
        const isLine = effectiveType === 'line' || isArea;

        return {
          name: s.label,
          type: isLine ? 'line' : 'bar',
          smooth: isLine,
          areaStyle: isArea ? { opacity: 0.25 } : undefined,
          data: isLine ? cleanData.map((item) => item[s.key] ?? 0) : barData(s.key),
          itemStyle: {
            color: PALETTE[idx % PALETTE.length],
            borderRadius: isLine ? 0 : [6, 6, 0, 0],
          },
          emphasis: { focus: 'series' },
        };
      }),
    };
  }, [chart_spec, data, isDark, compact]);

  // Texto bajo el gráfico con el valor de footer_key, p. ej. "Correlación de Pearson: -0,88".
  const footerKey = chart_spec.footer_key;
  const footerRow = footerKey ? data.find((item) => item[footerKey] !== null && item[footerKey] !== undefined) : undefined;
  const footerText = footerKey && footerRow ? `${chart_spec.footer_label || nombreDeCampo(footerKey)}: ${formatoCO(footerRow[footerKey])}` : null;

  return (
    <div className={`w-full h-full rounded-2xl border flex flex-col min-h-0 overflow-hidden ${compact ? 'p-3' : 'p-5'} ${isDark ? 'bg-[#111827] border-slate-700 shadow-xl shadow-black/20' : 'bg-white border-blue-100 shadow-xl shadow-blue-500/5'}`}>
      <div className={`${compact ? 'pb-1.5 mb-1.5' : 'pb-3 mb-3'} border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div>
          <h3
            onPointerDown={onTitlePointerDown}
            onPointerMove={onTitlePointerMove}
            onPointerUp={onTitlePointerUp}
            onPointerCancel={onTitlePointerUp}
            className={`w-fit max-w-[calc(100%-6.5rem)] truncate touch-none select-none cursor-move font-semibold ${compact ? 'text-sm' : 'text-base'} ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
            title="Mantén pulsado y arrastra para mover"
          >
            {chart_spec.title}
          </h3>
        </div>
      </div>

      <div className="w-full flex-1 min-h-0">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
          notMerge={true}
        />
      </div>
      {footerText && (
        <p className={`${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'} ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {footerText}
        </p>
      )}
      {(lectura || acciones) && (
        <div className="mt-2 flex items-end gap-2">
          {lectura && (
            <p title={lectura} className={`min-w-0 flex-1 line-clamp-3 text-xs leading-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {lectura}
            </p>
          )}
          {acciones && <div className="ml-auto flex shrink-0 gap-2">{acciones}</div>}
        </div>
      )}
    </div>
  );
}