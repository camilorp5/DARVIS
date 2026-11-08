'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Users, BarChart3 } from 'lucide-react';

// Estructura del JSON provisto
const rawApiResponse = {
  status: "success",
  row_count: 7,
  data: [
    { rango_edad: "18-24", total_hombres: 18202, total_mujeres: 7415, total_general: 25617 },
    { rango_edad: "25-34", total_hombres: 126112, total_mujeres: 14829, total_general: 140941 },
    { rango_edad: "35-49", total_hombres: 265254, total_mujeres: 12055, total_general: 277309 },
    { rango_edad: "50-64", total_hombres: 232864, total_mujeres: 6501, total_general: 239365 },
    { rango_edad: "65+", total_hombres: 173127, total_mujeres: 2572, total_general: 175699 },
    { rango_edad: "RANGO_EDAD", total_hombres: 0, total_mujeres: 0, total_general: 1 },
    { rango_edad: "SIN_INFORMACION", total_hombres: 5248, total_mujeres: 1, total_general: 17492 }
  ]
};

export default function DemographicsChart() {
  // 1. Filtrado de ruido residual del CSV/SQL
  const cleanedData = rawApiResponse.data.filter(
    (item) => item.rango_edad !== "RANGO_EDAD" && item.rango_edad !== "SIN_INFORMACION"
  );

  const categories = cleanedData.map((item) => item.rango_edad);
  const hombresData = cleanedData.map((item) => item.total_hombres);
  const mujeresData = cleanedData.map((item) => item.total_mujeres);

  // 2. Configuración de ECharts con estética blanco y azul
  const option = {
    color: ['#2563eb', '#38bdf8'], // Azul primario y Azul claro
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: '#1e293b' },
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['Hombres', 'Mujeres'],
      bottom: 0,
      textStyle: { color: '#475569', fontWeight: '500' }
    },
    grid: {
      top: '15%',
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: [
      {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontWeight: '500' }
      }
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b' }
      }
    ],
    series: [
      {
        name: 'Hombres',
        type: 'bar',
        emphasis: { focus: 'series' },
        data: hombresData,
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      },
      {
        name: 'Mujeres',
        type: 'bar',
        emphasis: { focus: 'series' },
        data: mujeresData,
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      }
    ]
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white border border-blue-100 rounded-2xl shadow-xl shadow-blue-500/5 p-6">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Distribución Demográfica</h3>
            <p className="text-sm text-slate-500">Métricas desagregadas por edad y género</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
          <Users className="w-3.5 h-3.5" />
          <span>{cleanedData.length} rangos analizados</span>
        </div>
      </div>

      <div className="h-[380px] w-full">
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}