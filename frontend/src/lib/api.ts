import { ApiResponse, CasoGuiaResumen, ChartSpec } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://darvis-j5ei.onrender.com';

export async function executeSqlQuery(sql: string, chartSpec?: ChartSpec): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      chart_spec: chartSpec || null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error de conexión con el backend' }));
    throw new Error(errorData.detail || `Error del servidor HTTP ${response.status}`);
  }

  return response.json();
}

export async function getCasoGuia(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/caso-guia`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error de conexión con el backend' }));
    throw new Error(errorData.detail || `Error HTTP ${response.status}`);
  }

  return response.json();
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Repite una petición que falló (p. ej. "Failed to fetch") antes de darla por fallida.
export async function conReintentos<T>(pedir: () => Promise<T>, reintentos = 2, esperaMs = 400): Promise<T> {
  for (let intento = 0; ; intento += 1) {
    try {
      return await pedir();
    } catch (error) {
      if (intento >= reintentos) throw error;
      await esperar(esperaMs);
    }
  }
}

// Devuelve una función que deja correr como máximo `limite` tareas a la vez; las demás esperan su turno en orden.
export function crearLimitador(limite: number) {
  let activas = 0;
  const cola: Array<() => void> = [];
  return async function limitar<T>(tarea: () => Promise<T>): Promise<T> {
    if (activas < limite) activas += 1;
    else await new Promise<void>((resolve) => cola.push(resolve)); // hereda el turno de la tarea que termina
    try {
      return await tarea();
    } finally {
      const siguiente = cola.shift();
      if (siguiente) siguiente();
      else activas -= 1;
    }
  };
}

export async function getCasoGuiaResumen(): Promise<CasoGuiaResumen> {
  const response = await fetch(`${API_BASE_URL}/caso-guia/resumen`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error de conexión con el backend' }));
    throw new Error(errorData.detail || `Error HTTP ${response.status}`);
  }

  return response.json();
}

export async function getCasoGuiaPanel(id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/caso-guia/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error de conexión con el backend' }));
    throw new Error(errorData.detail || `Error HTTP ${response.status}`);
  }

  return response.json();
}

export async function sendChatPrompt(prompt: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error al conectar con la API de Groq' }));
    throw new Error(errorData.detail || `Error HTTP ${response.status}`);
  }

  return response.json();
}