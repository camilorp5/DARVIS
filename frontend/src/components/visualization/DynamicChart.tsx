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
  | 'gauge';

interface DynamicChartProps {
  response: ApiResponse;
  isDark?: boolean;
  compact?: boolean;
  onTitlePointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp?: () => void;
}

const PALETTE = [
  '#2563eb', '#38bdf8', '#6366f1', '#0ea5e9', '#0284c7',
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'
];

export default function DynamicChart({
  response,
  isDark = false,
  compact = false,
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
      const labelKey = chart_spec.label_key || (cleanData.some((item) => 'nombre_mostrar' in item) ? 'nombre_mostrar' : undefined);
      const maxSize = sizeKey ? Math.max(0, ...cleanData.map((item) => Number(item[sizeKey]) || 0)) : 0;
      const scatterData = cleanData.map((item) => [
        item[chart_spec.x_axis],
        item[primarySeries.key],
        sizeKey ? item[sizeKey] : null,
        labelKey ? item[labelKey] : null,
      ]);

      return {
        textStyle: { color: textColor },
        tooltip: {
          ...tooltipOutsideChart,
          trigger: 'item',
          position: (point: number[], _params: any, _dom: HTMLElement, _rect: any, size: any) => {
            const [viewWidth, viewHeight] = size.viewSize;
            const [contentWidth, contentHeight] = size.contentSize;
            const openRight = point[0] < viewWidth / 2;
            const x = openRight ? point[0] + 16 : point[0] - contentWidth - 16;
            const y = Math.max(8, Math.min(point[1] - contentHeight / 2, viewHeight - contentHeight - 8));
            return [x, y];
          },
          formatter: (params: any) => [
            params.value[3],
            `${xAxisLabel}: ${params.value[0]}`,
            `${primarySeries.label}: ${params.value[1]}`,
            sizeKey ? `${chart_spec.size_label || sizeKey}: ${params.value[2]}` : null,
          ].filter(Boolean).join('<br/>'),
        },
        grid: { top: compact ? '12%' : '15%', left: compact ? '14%' : '16%', right: '5%', bottom: compact ? '20%' : '18%', containLabel: true },
        xAxis: {
          type: 'value', min: chart_spec.x_axis_min, max: chart_spec.x_axis_max,
          name: xAxisLabel, nameLocation: 'middle', nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize },
          axisLine: { lineStyle: { color: axisColor } },
        },
        yAxis: {
          type: 'value', min: chart_spec.y_axis_min, max: chart_spec.y_axis_max, scale: Boolean(sizeKey),
          name: chart_spec.y_axis_label || primarySeries.label, nameLocation: 'middle', nameRotate: 90, nameGap: compact ? 32 : 42,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize },
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
      const rawValue = Number(cleanData[0]?.[primarySeries.key] ?? 0);
      const percentage = Number.isFinite(rawValue)
        ? Math.min(100, Math.max(0, rawValue <= 1 ? rawValue * 100 : rawValue))
        : 0;
      const val = Number(percentage.toFixed(1));

      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, formatter: '{a} <br/>{b} : {c}%' },
        series: [
          {
            name: primarySeries.label,
            type: 'gauge',
            min: 0,
            max: 100,
            progress: { show: true },
            radius: '90%',
            center: ['50%', '56%'],
            detail: { valueAnimation: true, formatter: '{value}%' },
            data: [{ value: val, name: primarySeries.label }],
          },
        ],
      };
    }

    // --- CASO 5: Cartesianos Específicos (Barras Horizontales) ---
    if (chartType === 'horizontal_bar') {
      return {
        textStyle: { color: textColor },
        tooltip: { ...tooltipOutsideChart, trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { color: textColor, fontSize: axisFontSize } },
        grid: { top: compact ? '12%' : '15%', left: compact ? '15%' : '17%', right: '5%', bottom: compact ? '20%' : '18%', containLabel: true },
        xAxis: {
          type: 'value', min: chart_spec.x_axis_min, max: chart_spec.x_axis_max,
          name: yAxisLabel, nameLocation: 'middle', nameGap: axisNameGap,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: { color: mutedColor, fontSize: axisFontSize },
          splitLine: { lineStyle: { color: splitColor } },
        },
        yAxis: {
          type: 'category', data: categories,
          name: xAxisLabel, nameLocation: 'end', nameRotate: 0, nameGap: compact ? 8 : 10,
          nameTextStyle: { color: textColor, fontSize: axisFontSize },
          axisLabel: {
            color: mutedColor,
            fontSize: axisFontSize,
            interval: categoryInterval,
            hideOverlap: true,
            overflow: 'truncate',
            width: compact ? 66 : 110,
            formatter: formatCategory,
          },
          axisLine: { lineStyle: { color: axisColor } },
        },
        series: chart_spec.series.map((s, idx) => ({
          name: s.label,
          type: 'bar',
          data: cleanData.map((item) => item[s.key] ?? 0),
          itemStyle: { color: PALETTE[idx % PALETTE.length], borderRadius: [0, 6, 6, 0] },
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
          data: cleanData.map((item) => item[s.key] ?? 0),
          itemStyle: {
            color: PALETTE[idx % PALETTE.length],
            borderRadius: isLine ? 0 : [6, 6, 0, 0],
          },
          emphasis: { focus: 'series' },
        };
      }),
    };
  }, [chart_spec, data, isDark, compact]);

  return (
    <div className={`w-full h-full rounded-2xl border flex flex-col min-h-0 overflow-hidden ${compact ? 'p-3' : 'p-5'} ${isDark ? 'bg-[#111827] border-slate-700 shadow-xl shadow-black/20' : 'bg-white border-blue-100 shadow-xl shadow-blue-500/5'}`}>
      <div className={`${compact ? 'pb-1.5 mb-1.5' : 'pb-3 mb-3'} border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div>
          <h3
            onPointerDown={onTitlePointerDown}
            onPointerMove={onTitlePointerMove}
            onPointerUp={onTitlePointerUp}
            onPointerCancel={onTitlePointerUp}
            className={`w-fit max-w-[calc(100%-2rem)] truncate touch-none select-none cursor-move font-semibold ${compact ? 'text-sm' : 'text-base'} ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
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
    </div>
  );
}