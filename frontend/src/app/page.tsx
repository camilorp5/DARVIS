'use client';

import { PointerEvent, useEffect, useRef, useState } from 'react';
import { conReintentos, crearLimitador, getCasoGuiaPanel, getCasoGuiaResumen, sendChatPrompt } from '@/lib/api';
import { ApiResponse, Indicador } from '@/types';
import DynamicChart from '@/components/visualization/DynamicChart';
import DetallesTarjeta from '@/components/caso-guia/DetallesTarjeta';
import {
  ALTO_MINIMO,
  ANCHO_MINIMO,
  MARGEN,
  SEPARACION,
  acomodarTarjetas,
  alternarMaximizacion,
  alternarMinimizacion,
  ordenarTarjetas,
  restaurar,
  type DashboardChart,
} from '@/components/lienzo/tarjetas';
import { Send, Loader2, AlertCircle, Trash2, Settings2, ChevronLeft, ChevronRight, Sun, Moon, X, Minus, Maximize2, Minimize2, ChevronDown, LayoutGrid } from 'lucide-react';

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
  ['interval', 'Intervalo'],
] as const;

// Paneles fijos del caso guía, en el orden en que se agregan al lienzo (ids de GET /caso-guia/{id}).
const PANELES_CASO_GUIA = ['embudo', 'dispersion', 'intervalo', 'brecha', 'robustez'] as const;

// Nombre de cada panel en los avisos de error.
const NOMBRE_PANEL: Record<string, string> = {
  embudo: 'embudo de selección',
  dispersion: 'cobertura frente a hacinamiento',
  intervalo: 'intervalo de la razón O/E',
  brecha: 'brecha de clientes',
  robustez: 'robustez con el IMCV',
};

// Alto inicial de las tarjetas del caso guía. Para los indicadores se pidieron unos 260 px; se usa 320,
// el mínimo de redimensión. El intervalo es más alto porque lleva una fila por comuna.
const ALTO_INDICADORES = ALTO_MINIMO;
const ALTO_GRAFICO = 420;
const ALTO_INTERVALO = 560;
// Con menos alto que este, la lectura se oculta para no recortar el gráfico.
const ALTO_PARA_LECTURA = 380;
const MARGEN_MAXIMIZADA = 12;
// Al cargar el caso guía: máximo de peticiones a la vez (cada una reintenta hasta 2 veces, ver conReintentos).
const PETICIONES_SIMULTANEAS_CASO_GUIA = 2;
const TITULO_INDICADORES = 'Resultados del caso guía';

const mensajeDeError = (error: unknown) =>
  (error instanceof Error && error.message) || 'Error al comunicarse con el backend de DARVIS';

const claseBotonTarjeta = (isDark: boolean) =>
  `flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? 'border-slate-700 bg-slate-900/95 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white/95 text-slate-600 hover:bg-slate-50'}`;

const claseBotonTexto = (isDark: boolean) =>
  `rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;

function GrillaIndicadores({ kpis, isDark }: { kpis: Indicador[]; isDark: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.map((kpi) => (
        <div key={kpi.id} className={`min-w-0 rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-[#0d121c]' : 'border-slate-200 bg-white'}`}>
          <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{kpi.titulo}</p>
          <p className={`mt-1 text-2xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{kpi.valor}</p>
          <p className={`mt-1 break-words text-xs leading-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{kpi.detalle}</p>
        </div>
      ))}
    </div>
  );
}

type ArrastreTitulo = {
  onTitlePointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp?: () => void;
};

// Tarjeta minimizada: solo la barra del título, que sigue siendo el asa para arrastrar.
function BarraMinimizada({ titulo, isDark, onTitlePointerDown, onTitlePointerMove, onTitlePointerUp }: { titulo: string; isDark: boolean } & ArrastreTitulo) {
  return (
    <div className={`flex h-full items-center rounded-2xl border pl-4 pr-28 ${isDark ? 'bg-[#111827] border-slate-700' : 'bg-white border-blue-100'}`}>
      <h3
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onPointerCancel={onTitlePointerUp}
        className={`truncate touch-none select-none cursor-move text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
        title="Mantén pulsado y arrastra para mover"
      >
        {titulo}
      </h3>
    </div>
  );
}

type TarjetaIndicadoresProps = {
  response: ApiResponse;
  isDark: boolean;
  onTitlePointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp?: () => void;
};

// Respuesta del chat con chart_type "indicadores" (ancla del resumen): se dibujan los indicadores en vez de un gráfico.
function TarjetaIndicadores({ response, isDark, onTitlePointerDown, onTitlePointerMove, onTitlePointerUp }: TarjetaIndicadoresProps) {
  return (
    <div className={`w-full h-full rounded-2xl border p-5 flex flex-col min-h-0 overflow-hidden ${isDark ? 'bg-[#111827] border-slate-700' : 'bg-white border-blue-100'}`}>
      <div className={`pb-3 mb-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <h3
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={onTitlePointerUp}
          onPointerCancel={onTitlePointerUp}
          className={`w-fit max-w-[calc(100%-6.5rem)] truncate touch-none select-none cursor-move text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
          title="Mantén pulsado y arrastra para mover"
        >
          {response.chart_spec.title}
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {response.kpis?.length ? (
          <GrillaIndicadores kpis={response.kpis} isDark={isDark} />
        ) : (
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>La respuesta no trae indicadores.</p>
        )}
        {response.lectura && (
          <p className={`mt-3 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{response.lectura}</p>
        )}
      </div>
    </div>
  );
}

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
  // Contenedor desplazable del lienzo: da el ancho disponible para acomodar y el área visible para maximizar.
  const lienzoRef = useRef<HTMLElement>(null);
  // Copia de las tarjetas para leer el estado más reciente al terminar una carga asíncrona.
  const chartsRef = useRef<DashboardChart[]>([]);
  const [desplazarA, setDesplazarA] = useState<number | null>(null);

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
          lectura: data.lectura,
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

  // "Caso guía": agrega al lienzo la tarjeta de indicadores y los 5 gráficos como tarjetas normales.
  // Si se pulsa otra vez, reemplaza las del caso anterior y conserva las del chat.
  const cargarCasoGuia = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Las 6 peticiones pasan por un limitador y cada una se reintenta antes de darse por fallida.
      const limitar = crearLimitador(PETICIONES_SIMULTANEAS_CASO_GUIA);
      const pedir = <T,>(peticion: () => Promise<T>) => limitar(() => conReintentos(peticion));
      const [[resumen], paneles] = await Promise.all([
        Promise.allSettled([pedir(getCasoGuiaResumen)]),
        Promise.allSettled(PANELES_CASO_GUIA.map((id) => pedir(() => getCasoGuiaPanel(id)))),
      ]);
      const errores: string[] = [];
      const nuevas: { tarjeta: DashboardChart; anchoCompleto: boolean }[] = [];
      const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preguntas = new Map<string, string>(
        resumen.status === 'fulfilled'
          ? resumen.value.paneles.map((panel) => [panel.id, panel.pregunta] as [string, string])
          : [],
      );

      if (resumen.status === 'fulfilled') {
        nuevas.push({
          anchoCompleto: true,
          tarjeta: {
            id: `${base}-indicadores`,
            response: {
              status: 'success',
              row_count: resumen.value.kpis.length,
              chart_spec: { chart_type: 'indicadores', title: TITULO_INDICADORES, x_axis: '', series: [] },
              data: [],
              kpis: resumen.value.kpis,
            },
            x: 0,
            y: 0,
            width: 0,
            height: ALTO_INDICADORES,
            grupo: 'caso-guia',
          },
        });
      } else {
        errores.push(`faltan los indicadores (${mensajeDeError(resumen.reason)})`);
      }

      paneles.forEach((resultado, indice) => {
        const id = PANELES_CASO_GUIA[indice];
        if (resultado.status === 'fulfilled') {
          nuevas.push({
            anchoCompleto: false,
            tarjeta: {
              id: `${base}-${id}`,
              response: resultado.value,
              x: 0,
              y: 0,
              width: 0,
              height: id === 'intervalo' ? ALTO_INTERVALO : ALTO_GRAFICO,
              grupo: 'caso-guia',
              lectura: resultado.value.lectura,
              pregunta: preguntas.get(id),
            },
          });
        } else {
          errores.push(`no se pudo cargar «${NOMBRE_PANEL[id]}» (${mensajeDeError(resultado.reason)})`);
        }
      });

      if (nuevas.length === 0) {
        setErrorMessage(`No se pudo cargar el caso guía: ${errores.join('; ')}.`);
        return;
      }

      // Debajo de las tarjetas del chat, para no tapar ninguna.
      const restantes = chartsRef.current.filter((tarjeta) => tarjeta.grupo !== 'caso-guia');
      const yInicial = restantes.length
        ? Math.max(...restantes.map((tarjeta) => tarjeta.y + tarjeta.height)) + SEPARACION
        : MARGEN;
      const geometrias = acomodarTarjetas(
        nuevas.map(({ tarjeta, anchoCompleto }) => ({ alto: tarjeta.height, anchoCompleto })),
        lienzoRef.current?.clientWidth ?? 1200,
        yInicial,
      );
      const colocadas = nuevas.map(({ tarjeta }, indice) => ({ ...tarjeta, ...geometrias[indice] }));
      setCharts([...restantes, ...colocadas]);
      setSelectedChartId(colocadas[0].id);
      setDesplazarA(Math.max(0, yInicial - MARGEN));
      if (errores.length) setErrorMessage(`El caso guía quedó incompleto: ${errores.join('; ')}.`);
    } finally {
      setIsLoading(false);
    }
  };

  // "Preguntar esto en el chat": envía la pregunta exacta y agrega la respuesta como otra tarjeta.
  const preguntarEnChat = (pregunta: string) => {
    setUserPrompt(pregunta);
    void loadChart(() => sendChatPrompt(pregunta));
  };

  const alternarDetalles = (id: string) => {
    setCharts((actual) => actual.map((tarjeta) => (tarjeta.id === id ? { ...tarjeta, detallesAbiertos: !tarjeta.detallesAbiertos } : tarjeta)));
  };

  const alternarMinimizada = (id: string) => {
    setCharts((actual) => actual.map((tarjeta) => (tarjeta.id === id ? alternarMinimizacion(tarjeta) : tarjeta)));
  };

  // Maximizar ocupa el área visible del lienzo, por encima de las demás; solo una a la vez.
  const alternarMaximizada = (id: string) => {
    const lienzo = lienzoRef.current;
    const areaVisible = {
      x: (lienzo?.scrollLeft ?? 0) + MARGEN_MAXIMIZADA,
      y: (lienzo?.scrollTop ?? 0) + MARGEN_MAXIMIZADA,
      width: Math.max(ANCHO_MINIMO, (lienzo?.clientWidth ?? 1200) - 2 * MARGEN_MAXIMIZADA),
      height: Math.max(ALTO_MINIMO, (lienzo?.clientHeight ?? 800) - 2 * MARGEN_MAXIMIZADA),
    };
    setCharts((actual) => actual.map((tarjeta) => {
      if (tarjeta.id === id) return alternarMaximizacion(tarjeta, areaVisible);
      return tarjeta.ventana === 'maximizada' ? restaurar(tarjeta) : tarjeta;
    }));
    setSelectedChartId(id);
  };

  const ordenarLienzo = () => {
    const anchoLienzo = lienzoRef.current?.clientWidth ?? 1200;
    setCharts((actual) => ordenarTarjetas(actual, anchoLienzo));
    setDesplazarA(0);
  };

  useEffect(() => {
    chartsRef.current = charts;
  }, [charts]);

  // Escape restaura la tarjeta maximizada.
  useEffect(() => {
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setCharts((actual) => (actual.some((tarjeta) => tarjeta.ventana === 'maximizada')
        ? actual.map((tarjeta) => (tarjeta.ventana === 'maximizada' ? restaurar(tarjeta) : tarjeta))
        : actual));
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, []);

  // Lleva el lienzo hasta las tarjetas recién acomodadas, ya dibujadas.
  useEffect(() => {
    if (desplazarA === null) return;
    lienzoRef.current?.scrollTo({ top: desplazarA, behavior: 'smooth' });
    setDesplazarA(null);
  }, [desplazarA]);

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
        width: Math.max(ANCHO_MINIMO, pointerInteraction.initialWidth + deltaX),
        height: Math.max(ALTO_MINIMO, pointerInteraction.initialHeight + deltaY),
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

      <div className="relative flex flex-1 min-h-0">
        <section ref={lienzoRef} className={`relative flex-1 min-w-0 overflow-auto ${isDarkMode ? 'bg-[#090d14]' : 'bg-slate-100/70'}`}>
          {errorMessage && (
            // Envoltura fija de alto cero: el aviso queda visible aunque el lienzo esté desplazado.
            <div className="sticky top-0 z-[2000] h-0">
              <div role="alert" className="absolute left-4 right-4 top-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm">
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 rounded-md p-1 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          {charts.length === 0 && (
            <div className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Los gráficos aparecerán aquí
            </div>
          )}
          <div className="relative min-w-full min-h-full" style={{ height: dashboardHeight }}>
            {charts.map((chart, index) => {
              const minimizada = chart.ventana === 'minimizada';
              const maximizada = chart.ventana === 'maximizada';
              const titulo = chart.response.chart_spec.title;
              const arrastre = {
                onTitlePointerDown: (event: PointerEvent<HTMLElement>) => startInteraction(event, chart, 'move'),
                onTitlePointerMove: continueInteraction,
                onTitlePointerUp: () => setPointerInteraction(null),
              };
              return (
                <article
                  key={chart.id}
                  aria-label={titulo}
                  onClick={() => setSelectedChartId(chart.id)}
                  className={`absolute rounded-2xl ${isDarkMode ? 'bg-[#111827]' : 'bg-white'} ${selectedChartId === chart.id ? 'ring-2 ring-blue-500 shadow-2xl' : 'shadow-lg'} overflow-hidden`}
                  style={{
                    left: chart.x,
                    top: chart.y,
                    width: chart.width,
                    height: chart.height,
                    zIndex: maximizada ? charts.length + 2 : selectedChartId === chart.id ? charts.length + 1 : index + 1,
                  }}
                >
                  <div className={`absolute right-3 z-20 flex items-center gap-1 ${minimizada ? 'top-2' : 'top-3'}`}>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); alternarMinimizada(chart.id); }}
                      className={claseBotonTarjeta(isDarkMode)}
                      title={minimizada ? 'Restaurar tamaño' : 'Minimizar'}
                      aria-label={minimizada ? `Restaurar tamaño de ${titulo}` : `Minimizar ${titulo}`}
                    >
                      {minimizada ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); alternarMaximizada(chart.id); }}
                      className={claseBotonTarjeta(isDarkMode)}
                      title={maximizada ? 'Restaurar (Esc)' : 'Maximizar'}
                      aria-label={maximizada ? `Restaurar ${titulo}` : `Maximizar ${titulo}`}
                    >
                      {maximizada ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); deleteChart(chart.id); }}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${isDarkMode ? 'border-slate-700 bg-slate-900/95 text-red-300 hover:bg-slate-800' : 'border-red-100 bg-white/95 text-red-600 hover:bg-red-50'}`}
                      title="Eliminar gráfico"
                      aria-label={`Eliminar ${titulo}`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                  {minimizada ? (
                    <BarraMinimizada titulo={titulo} isDark={isDarkMode} {...arrastre} />
                  ) : chart.response.chart_spec.chart_type === 'indicadores' ? (
                    <TarjetaIndicadores response={chart.response} isDark={isDarkMode} {...arrastre} />
                  ) : (
                    <DynamicChart
                      response={chart.response}
                      isDark={isDarkMode}
                      compact={chart.width < 500 || chart.height < 400}
                      lectura={chart.height >= ALTO_PARA_LECTURA ? chart.lectura : undefined}
                      acciones={chart.grupo === 'caso-guia' ? (
                        <button
                          type="button"
                          aria-expanded={Boolean(chart.detallesAbiertos)}
                          onClick={() => alternarDetalles(chart.id)}
                          className={claseBotonTexto(isDarkMode)}
                        >
                          Detalles
                        </button>
                      ) : undefined}
                      {...arrastre}
                    />
                  )}
                  {chart.detallesAbiertos && !minimizada && (
                    <DetallesTarjeta
                      titulo={titulo}
                      lectura={chart.lectura}
                      pregunta={chart.pregunta}
                      sql={chart.response.generated_sql}
                      datos={chart.response.data}
                      isDark={isDarkMode}
                      onPreguntar={preguntarEnChat}
                      onCerrar={() => alternarDetalles(chart.id)}
                    />
                  )}
                  {!minimizada && !maximizada && (
                    <div
                      onPointerDown={(event) => startInteraction(event, chart, 'resize')}
                      onPointerMove={continueInteraction}
                      onPointerUp={() => setPointerInteraction(null)}
                      onPointerCancel={() => setPointerInteraction(null)}
                      className={`absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize touch-none rounded-tl-md ${isDarkMode ? 'bg-blue-400/90' : 'bg-blue-600/90'}`}
                      title="Arrastrar para cambiar el tamaño"
                      aria-label="Cambiar tamaño del gráfico"
                    />
                  )}
                </article>
              );
            })}
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
            onClick={() => void cargarCasoGuia()}
            disabled={isLoading}
            className={`shrink-0 rounded-xl border px-4 py-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Caso guía
          </button>
          <button
            type="button"
            onClick={ordenarLienzo}
            disabled={charts.length === 0}
            title="Ordenar las tarjetas del lienzo sin que se encimen"
            aria-label="Ordenar tarjetas"
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ordenar</span>
          </button>
        </div>
      </footer>
    </main>
  );
}