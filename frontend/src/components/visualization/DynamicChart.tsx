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
    // 1. Filtrado defensivo de filas de encabezado
    const cleanData = data.filter(
      (item) => String(item[chart_spec.x_axis]).toUpperCase() !== chart_spec.x_axis.toUpperCase()
    );

    const categories = cleanData.map((item) => String(item[chart_spec.x_axis] ?? 'S/I'));
    const chartType = chart_spec.chart_type as ChartType;
    const xAxisLabel = chart_spec.x_axis_label || chart_spec.x_axis;

    // --- CASO 1: Gráficos Circulares (Pie / Dona) ---
    if (chartType === 'pie' || chartType === 'doughnut') {
      const primarySeries = chart_spec.series[0];
      const pieData = cleanData.map((item) => ({
        name: String(item[chart_spec.x_axis] ?? 'S/I'),
        value: Number(item[primarySeries?.key] ?? 0),
      }));

      return {
        textStyle: { color: textColor },
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, textStyle: { color: textColor, fontWeight: '500' } },
        color: PALETTE,
        series: [
          {
            name: primarySeries?.label || chart_spec.title,
            type: 'pie',
            radius: chartType === 'doughnut' ? ['40%', '70%'] : '65%',
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: isDark ? '#111827' : '#fff', borderWidth: 2 },
            label: { show: true, formatter: '{b}: {d}%' },
            data: pieData,
          },
        ],
      };
    }

    // --- CASO 2: Gráfico de Dispersión (Scatterplot) ---
    if (chartType === 'scatter') {
      const primarySeries = chart_spec.series[0];
      const scatterData = cleanData.map((item) => [
        item[chart_spec.x_axis],
        item[primarySeries.key],
      ]);

      return {
        textStyle: { color: textColor },
        tooltip: { trigger: 'item', formatter: (params: any) => `${xAxisLabel}: ${params.value[0]}<br/>${primarySeries.label}: ${params.value[1]}` },
        grid: { top: '15%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: { type: 'value', name: xAxisLabel, nameTextStyle: { color: textColor }, axisLabel: { color: mutedColor }, axisLine: { lineStyle: { color: axisColor } } },
        yAxis: { type: 'value', name: primarySeries.label, nameTextStyle: { color: textColor }, axisLabel: { color: mutedColor }, splitLine: { lineStyle: { color: splitColor } } },
        series: [
          {
            name: primarySeries.label,
            type: 'scatter',
            symbolSize: 10,
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
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: textColor } },
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
        tooltip: { formatter: '{a} <br/>{b} : {c}%' },
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
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { color: textColor } },
        grid: { top: '15%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: { type: 'value', name: xAxisLabel, nameTextStyle: { color: textColor }, axisLabel: { color: mutedColor }, splitLine: { lineStyle: { color: splitColor } } },
        yAxis: { type: 'category', data: categories, name: xAxisLabel, axisLabel: { color: mutedColor }, axisLine: { lineStyle: { color: axisColor } } },
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
        trigger: 'axis',
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor },
        axisPointer: { type: chartType === 'line' || chartType === 'area' ? 'line' : 'shadow' },
      },
      legend: { bottom: 0, textStyle: { color: textColor, fontWeight: '500' } },
      grid: { top: '15%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: [
        {
          type: isTimeSeries ? 'category' : 'category',
          data: categories,
          name: xAxisLabel,
          nameTextStyle: { color: textColor },
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { color: mutedColor, fontWeight: '500', rotate: categories.length > 8 ? 30 : 0 },
        },
      ],
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: splitColor } },
          axisLabel: { color: mutedColor },
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
  }, [chart_spec, data, isDark]);

  return (
    <div className={`w-full h-full rounded-2xl border p-5 flex flex-col min-h-0 overflow-hidden ${isDark ? 'bg-[#111827] border-slate-700 shadow-xl shadow-black/20' : 'bg-white border-blue-100 shadow-xl shadow-blue-500/5'}`}>
      <div className={`pb-3 mb-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div>
          <h3
            onPointerDown={onTitlePointerDown}
            onPointerMove={onTitlePointerMove}
            onPointerUp={onTitlePointerUp}
            onPointerCancel={onTitlePointerUp}
            className={`w-fit max-w-[calc(100%-2rem)] touch-none select-none cursor-move text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
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