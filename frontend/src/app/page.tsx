'use client';

import { PointerEvent, useState } from 'react';
import { getCasoGuia, sendChatPrompt } from '@/lib/api';
import { ApiResponse } from '@/types';
import DynamicChart from '@/components/visualization/DynamicChart';
import { Send, Loader2, AlertCircle, Trash2, Settings2, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';

type DashboardChart = {
  id: string;
  response: ApiResponse;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerInteraction = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
};

const CHART_TYPES = [
  ['bar', 'Barras'],
  ['horizontal_bar', 'Barras horizontales'],
  ['line', 'Líneas'],
  ['area', 'Área'],
  ['pie', 'Circular'],
  ['doughnut', 'Dona'],
  ['scatter', 'Dispersión'],
  ['radar', 'Radar'],
  ['gauge', 'Velocímetro'],
] as const;

export default function Home() {
  const [userPrompt, setUserPrompt] = useState('Muestra la cobertura de clientes por comuna, de mayor a menor');
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [pointerInteraction, setPointerInteraction] = useState<PointerInteraction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const selectedChart = charts.find((chart) => chart.id === selectedChartId) ?? null;
  const selectedChartType = selectedChart?.response.chart_spec.chart_type;
  const canSetXBounds = selectedChartType === 'scatter' || selectedChartType === 'horizontal_bar';
  const canSetYBounds = selectedChartType === 'scatter' || ['bar', 'line', 'area'].includes(selectedChartType ?? '');

  const loadChart = async (request: () => Promise<ApiResponse>) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await request();
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setCharts((current) => {
        const index = current.length;
        const chart: DashboardChart = {
          id,
          response: data,
          x: 24 + (index % 4) * 40,
          y: 24 + index * 34,
          width: 720,
          height: 520,
        };
        return [...current, chart];
      });
      setSelectedChartId(id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al comunicarse con el backend de DARVIS');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPrompt = () => {
    if (!userPrompt.trim()) return;
    void loadChart(() => sendChatPrompt(userPrompt));
  };

  const startInteraction = (
    event: PointerEvent<HTMLElement>,
    chart: DashboardChart,
    mode: PointerInteraction['mode'],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedChartId(chart.id);
    setPointerInteraction({
      id: chart.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initialX: chart.x,
      initialY: chart.y,
      initialWidth: chart.width,
      initialHeight: chart.height,
    });
  };

  const continueInteraction = (event: PointerEvent<HTMLElement>) => {
    if (!pointerInteraction) return;
    const deltaX = event.clientX - pointerInteraction.startX;
    const deltaY = event.clientY - pointerInteraction.startY;

    setCharts((current) => current.map((chart) => {
      if (chart.id !== pointerInteraction.id) return chart;
      if (pointerInteraction.mode === 'move') {
        return {
          ...chart,
          x: Math.max(0, pointerInteraction.initialX + deltaX),
          y: Math.max(0, pointerInteraction.initialY + deltaY),
        };
      }
      return {
        ...chart,
        width: Math.max(360, pointerInteraction.initialWidth + deltaX),
        height: Math.max(320, pointerInteraction.initialHeight + deltaY),
      };
    }));
  };

  const updateSelectedChart = (updateSpec: (spec: ApiResponse['chart_spec']) => ApiResponse['chart_spec']) => {
    if (!selectedChartId) return;
    setCharts((current) => current.map((chart) => chart.id === selectedChartId
      ? { ...chart, response: { ...chart.response, chart_spec: updateSpec(chart.response.chart_spec) } }
      : chart));
  };

  const updateAxisLimit = (axis: 'x' | 'y', edge: 'min' | 'max', value: string) => {
    updateSelectedChart((spec) => {
      const field = `${axis}_axis_${edge}` as 'x_axis_min' | 'x_axis_max' | 'y_axis_min' | 'y_axis_max';
      return { ...spec, [field]: value === '' ? undefined : Number(value) };
    });
  };

  const deleteChart = (id: string) => {
    const remaining = charts.filter((chart) => chart.id !== id);
    setCharts(remaining);
    if (selectedChartId === id) setSelectedChartId(remaining.at(-1)?.id ?? null);
  };

  const dashboardHeight = Math.max(620, ...charts.map((chart) => chart.y + chart.height + 32));

  return (
    <main className={`h-screen min-h-[560px] overflow-hidden flex flex-col ${isDarkMode ? 'bg-[#090d14] text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <header className={`h-14 shrink-0 flex items-center justify-between border-b px-5 ${isDarkMode ? 'border-slate-800 bg-[#0d121c]' : 'border-slate-200 bg-white'}`}>
        <div className={`text-lg font-bold tracking-[0.18em] ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>DARVIS</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDarkMode((dark) => !dark)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            aria-label={isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isDarkMode ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen((open) => !open)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            aria-expanded={isSettingsOpen}
            aria-label={isSettingsOpen ? 'Cerrar configuraciones' : 'Abrir configuraciones'}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configuración</span>
            {isSettingsOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <section className={`relative flex-1 min-w-0 overflow-auto ${isDarkMode ? 'bg-[#090d14]' : 'bg-slate-100/70'}`}>
          {errorMessage && (
            <div className="absolute left-4 right-4 top-4 z-[2000] flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {charts.length === 0 && (
            <div className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Los gráficos aparecerán aquí
            </div>
          )}
          <div className="relative min-w-full min-h-full" style={{ height: dashboardHeight }}>
            {charts.map((chart, index) => (
              <article
                key={chart.id}
                onClick={() => setSelectedChartId(chart.id)}
                className={`absolute rounded-2xl ${isDarkMode ? 'bg-[#111827]' : 'bg-white'} ${selectedChartId === chart.id ? 'ring-2 ring-blue-500 shadow-2xl' : 'shadow-lg'} overflow-hidden`}
                style={{ left: chart.x, top: chart.y, width: chart.width, height: chart.height, zIndex: selectedChartId === chart.id ? charts.length + 1 : index + 1 }}
              >
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); deleteChart(chart.id); }}
                  className={`absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900/95 text-red-300 hover:bg-slate-800' : 'border-red-100 bg-white/95 text-red-600 hover:bg-red-50'}`}
                  title="Eliminar gráfico"
                  aria-label="Eliminar gráfico"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <DynamicChart
                  response={chart.response}
                  isDark={isDarkMode}
                  compact={chart.width < 500 || chart.height < 400}
                  onTitlePointerDown={(event) => startInteraction(event, chart, 'move')}
                  onTitlePointerMove={continueInteraction}
                  onTitlePointerUp={() => setPointerInteraction(null)}
                />
                <div
                  onPointerDown={(event) => startInteraction(event, chart, 'resize')}
                  onPointerMove={continueInteraction}
                  onPointerUp={() => setPointerInteraction(null)}
                  onPointerCancel={() => setPointerInteraction(null)}
                  className={`absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize touch-none rounded-tl-md ${isDarkMode ? 'bg-blue-400/90' : 'bg-blue-600/90'}`}
                  title="Arrastrar para cambiar el tamaño"
                  aria-label="Cambiar tamaño del gráfico"
                />
              </article>
            ))}
          </div>
        </section>

        {isSettingsOpen && (
          <aside className={`w-72 max-w-[85vw] shrink-0 overflow-y-auto border-l p-3 ${isDarkMode ? 'border-slate-800 bg-[#0d121c]' : 'border-slate-200 bg-white'}`}>
            <div className={`mb-3 flex items-center gap-1.5 border-b pb-2.5 ${isDarkMode ? 'border-slate-800 text-slate-100' : 'border-slate-100 text-slate-800'}`}>
              <Settings2 className={`h-3.5 w-3.5 ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`} />
              <h2 className="text-xs font-semibold">Configuración del gráfico</h2>
            </div>
            {selectedChart ? (
              <div className="space-y-2.5">
                <label className={`block space-y-1 text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Título
                  <input
                    value={selectedChart.response.chart_spec.title}
                    onChange={(event) => updateSelectedChart((spec) => ({ ...spec, title: event.target.value }))}
                    className={`w-full rounded-md border p-2 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                  />
                </label>
                <label className={`block space-y-1 text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Etiqueta del eje X
                  <input
                    value={selectedChart.response.chart_spec.x_axis_label ?? selectedChart.response.chart_spec.x_axis}
                    onChange={(event) => updateSelectedChart((spec) => ({ ...spec, x_axis_label: event.target.value }))}
                    className={`w-full rounded-md border p-2 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                  />
                </label>
                <label className={`block space-y-1 text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Etiqueta del eje Y
                  <input
                    value={selectedChart.response.chart_spec.y_axis_label ?? selectedChart.response.chart_spec.series[0]?.label ?? ''}
                    onChange={(event) => updateSelectedChart((spec) => ({ ...spec, y_axis_label: event.target.value }))}
                    className={`w-full rounded-md border p-2 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                  />
                </label>
                {(canSetXBounds || canSetYBounds) && (
                  <div className={`space-y-2 rounded-lg border p-2 ${isDarkMode ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div>
                      <h3 className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Rango de los ejes</h3>
                      <p className={`mt-0.5 text-[10px] leading-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Los límites se aplican solo a ejes numéricos. Déjalos vacíos para usar el rango automático.
                      </p>
                    </div>
                    {canSetXBounds && (
                      <div className="space-y-2">
                        <p className={`text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Eje X</p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className={`space-y-1 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Inicio
                            <input type="number" value={selectedChart.response.chart_spec.x_axis_min ?? ''} onChange={(event) => updateAxisLimit('x', 'min', event.target.value)} placeholder="Auto" className={`w-full rounded border p-1.5 text-xs ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`} />
                          </label>
                          <label className={`space-y-1 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Fin
                            <input type="number" value={selectedChart.response.chart_spec.x_axis_max ?? ''} onChange={(event) => updateAxisLimit('x', 'max', event.target.value)} placeholder="Auto" className={`w-full rounded border p-1.5 text-xs ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`} />
                          </label>
                        </div>
                      </div>
                    )}
                    {canSetYBounds && (
                      <div className="space-y-2">
                        <p className={`text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Eje Y</p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className={`space-y-1 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Inicio
                            <input type="number" value={selectedChart.response.chart_spec.y_axis_min ?? ''} onChange={(event) => updateAxisLimit('y', 'min', event.target.value)} placeholder="Auto" className={`w-full rounded border p-1.5 text-xs ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`} />
                          </label>
                          <label className={`space-y-1 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Fin
                            <input type="number" value={selectedChart.response.chart_spec.y_axis_max ?? ''} onChange={(event) => updateAxisLimit('y', 'max', event.target.value)} placeholder="Auto" className={`w-full rounded border p-1.5 text-xs ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <label className={`block space-y-1 text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Tipo de gráfico
                  <select
                    value={selectedChart.response.chart_spec.chart_type}
                    onChange={(event) => updateSelectedChart((spec) => ({ ...spec, chart_type: event.target.value }))}
                    className={`w-full rounded-md border p-2 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                  >
                    {CHART_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {selectedChart.response.chart_spec.series.map((series, index) => (
                  <label key={`${series.key}-${index}`} className={`block space-y-1 text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Etiqueta de serie: {series.key}
                    <input
                      value={series.label}
                      onChange={(event) => updateSelectedChart((spec) => ({
                        ...spec,
                        series: spec.series.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item),
                      }))}
                      className={`w-full rounded-md border p-2 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className={`text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Selecciona un gráfico del lienzo para editar sus propiedades.</p>
            )}
          </aside>
        )}
      </div>

      <footer className={`shrink-0 border-t px-4 py-3 sm:px-6 ${isDarkMode ? 'border-slate-800 bg-[#0d121c]' : 'border-slate-200 bg-white'}`}>
        <div className="mx-auto flex max-w-5xl gap-2">
          <input
            type="text"
            value={userPrompt}
            onChange={(event) => setUserPrompt(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSendPrompt()}
            placeholder="Escribe una consulta para crear un gráfico..."
            className={`min-w-0 flex-1 rounded-xl border p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
          />
          <button
            onClick={handleSendPrompt}
            disabled={isLoading}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Consultar</span>
          </button>
          <button
            type="button"
            onClick={() => void loadChart(getCasoGuia)}
            disabled={isLoading}
            className={`shrink-0 rounded-xl border px-4 py-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Caso guía
          </button>
        </div>
      </footer>
    </main>
  );
}