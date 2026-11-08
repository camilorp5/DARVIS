'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { ApiResponse } from '@/types';
import { BarChart3, Database } from 'lucide-react';

interface DynamicChartProps {
  response: ApiResponse;
}

export default function DynamicChart({ response }: DynamicChartProps) {
  const { chart_spec, data, row_count } = response;

  // Filtrado defensivo de filas basura si el encabezado fue leído como registro
  const cleanData = data.filter(
    (item) => String(item[chart_spec.x_axis]).toUpperCase() !== chart_spec.x_axis.toUpperCase()
  );

  const xAxisCategories = cleanData.map((item) => item[chart_spec.x_axis] ?? 'S/I');

  const palette = ['#2563eb', '#38bdf8', '#6366f1', '#0ea5e9', '#0284c7'];

  const seriesOptions = chart_spec.series.map((s, idx) => ({
    name: s.label,
    type: s.type || chart_spec.chart_type || 'bar',
    data: cleanData.map((item) => item[s.key] ?? 0),
    itemStyle: {
      color: palette[idx % palette.length],
      borderRadius: s.type === 'line' ? 0 : [6, 6, 0, 0],
    },
    emphasis: { focus: 'series' },
  }));

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: '#1e293b' },
      axisPointer: { type: 'shadow' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#475569', fontWeight: '500' },
    },
    grid: {
      top: '15%',
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true,
    },
    xAxis: [
      {
        type: 'category',
        data: xAxisCategories,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontWeight: '500' },
      },
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b' },
      },
    ],
    series: seriesOptions,
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white border border-blue-100 rounded-2xl shadow-xl shadow-blue-500/5 p-6 min-h-[450px]">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{chart_spec.title}</h3>
            <p className="text-sm text-slate-500">Renderizado generado desde DuckDB</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
          <Database className="w-3.5 h-3.5" />
          <span>{row_count} filas procesadas</span>
        </div>
      </div>

      <div className="w-full h-[380px] min-h-[380px]">
        <ReactECharts
          option={option}
          style={{ height: '380px', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
}