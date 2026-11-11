import { ApiResponse } from '@/types';

// Tarjeta del lienzo. Las del caso guía llevan grupo 'caso-guia', su lectura y su pregunta ancla.
export type DashboardChart = {
  id: string;
  response: ApiResponse;
  x: number;
  y: number;
  width: number;
  height: number;
  grupo?: 'caso-guia';
  lectura?: string;
  pregunta?: string;
  detallesAbiertos?: boolean;
  // Minimizar y maximizar guardan la posición y el tamaño previos para poder restaurarlos.
  ventana?: 'minimizada' | 'maximizada';
  xPrevio?: number;
  yPrevio?: number;
  anchoPrevio?: number;
  altoPrevio?: number;
};

export type Geometria = { x: number; y: number; width: number; height: number };

// Reglas de acomodo: márgenes, mínimos de redimensión y ancho del lienzo desde el que hay dos columnas.
export const MARGEN = 24;
export const SEPARACION = 24;
export const ANCHO_MINIMO = 360;
export const ALTO_MINIMO = 320;
export const ALTO_MINIMIZADA = 44;
export const ANCHO_DOS_COLUMNAS = 800;

type TarjetaParaAcomodar = { ancho?: number; alto: number; anchoCompleto?: boolean };

/**
 * Acomoda tarjetas en orden de lectura, sin encimarse: las de ancho completo van solas en su fila;
 * las demás, en dos columnas (una sola si el lienzo mide menos de ANCHO_DOS_COLUMNAS).
 * Respeta el ancho de cada tarjeta salvo que no quepa, y nunca cambia su alto.
 */
export function acomodarTarjetas(tarjetas: TarjetaParaAcomodar[], anchoLienzo: number, yInicial = MARGEN): Geometria[] {
  const anchoUtil = Math.max(ANCHO_MINIMO, anchoLienzo - 2 * MARGEN);
  const columnas = anchoLienzo < ANCHO_DOS_COLUMNAS ? 1 : 2;
  const anchoColumna = columnas === 1 ? anchoUtil : Math.max(ANCHO_MINIMO, Math.floor((anchoUtil - SEPARACION) / 2));
  let y = yInicial;
  let columna = 0;
  let altoFila = 0;
  const cerrarFila = () => {
    if (columna === 0) return;
    y += altoFila + SEPARACION;
    columna = 0;
    altoFila = 0;
  };

  return tarjetas.map((tarjeta) => {
    if (tarjeta.anchoCompleto) {
      cerrarFila();
      const geometria = { x: MARGEN, y, width: Math.min(tarjeta.ancho ?? anchoUtil, anchoUtil), height: tarjeta.alto };
      y += tarjeta.alto + SEPARACION;
      return geometria;
    }
    const geometria = {
      x: MARGEN + columna * (anchoColumna + SEPARACION),
      y,
      width: Math.min(tarjeta.ancho ?? anchoColumna, anchoColumna),
      height: tarjeta.alto,
    };
    altoFila = Math.max(altoFila, tarjeta.alto);
    columna += 1;
    if (columna === columnas) cerrarFila();
    return geometria;
  });
}

// Posición y tamaño "normales" de una tarjeta, esté o no minimizada o maximizada.
export function geometriaNormal(tarjeta: DashboardChart): Geometria {
  const ancho = tarjeta.anchoPrevio ?? tarjeta.width;
  const alto = tarjeta.altoPrevio ?? tarjeta.height;
  if (tarjeta.ventana === 'minimizada') return { x: tarjeta.x, y: tarjeta.y, width: ancho, height: alto };
  if (tarjeta.ventana === 'maximizada') {
    return { x: tarjeta.xPrevio ?? tarjeta.x, y: tarjeta.yPrevio ?? tarjeta.y, width: ancho, height: alto };
  }
  return { x: tarjeta.x, y: tarjeta.y, width: tarjeta.width, height: tarjeta.height };
}

const SIN_PREVIOS = { ventana: undefined, xPrevio: undefined, yPrevio: undefined, anchoPrevio: undefined, altoPrevio: undefined };

// Devuelve la tarjeta a su tamaño normal. La minimizada se queda donde se arrastró la barra.
export function restaurar(tarjeta: DashboardChart): DashboardChart {
  return tarjeta.ventana ? { ...tarjeta, ...geometriaNormal(tarjeta), ...SIN_PREVIOS } : tarjeta;
}

export function alternarMinimizacion(tarjeta: DashboardChart): DashboardChart {
  if (tarjeta.ventana === 'minimizada') return restaurar(tarjeta);
  const normal = geometriaNormal(tarjeta);
  return {
    ...tarjeta,
    ...normal,
    ...SIN_PREVIOS,
    ventana: 'minimizada',
    height: ALTO_MINIMIZADA,
    anchoPrevio: normal.width,
    altoPrevio: normal.height,
  };
}

export function alternarMaximizacion(tarjeta: DashboardChart, areaVisible: Geometria): DashboardChart {
  if (tarjeta.ventana === 'maximizada') return restaurar(tarjeta);
  const normal = geometriaNormal(tarjeta);
  return {
    ...tarjeta,
    ...areaVisible,
    ventana: 'maximizada',
    xPrevio: normal.x,
    yPrevio: normal.y,
    anchoPrevio: normal.width,
    altoPrevio: normal.height,
  };
}

/**
 * "Ordenar": reacomoda todas las tarjetas en orden de lectura (de arriba abajo y de izquierda a derecha).
 * Las maximizadas vuelven a su tamaño; las minimizadas se acomodan como barras; las de indicadores van a todo el ancho.
 */
export function ordenarTarjetas(tarjetas: DashboardChart[], anchoLienzo: number): DashboardChart[] {
  const enOrden = tarjetas
    .map((tarjeta) => (tarjeta.ventana === 'maximizada' ? restaurar(tarjeta) : tarjeta))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const geometrias = acomodarTarjetas(
    enOrden.map((tarjeta) => ({
      ancho: tarjeta.width,
      alto: tarjeta.height,
      anchoCompleto: tarjeta.response.chart_spec.chart_type === 'indicadores',
    })),
    anchoLienzo,
  );
  const acomodadas = new Map<string, DashboardChart>(
    enOrden.map((tarjeta, indice) => [tarjeta.id, { ...tarjeta, ...geometrias[indice] }] as [string, DashboardChart]),
  );
  // Conserva el orden del arreglo, y con él el orden de apilamiento.
  return tarjetas.map((tarjeta) => acomodadas.get(tarjeta.id) ?? tarjeta);
}
