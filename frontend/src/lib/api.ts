import { ApiResponse, ChartSpec } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://darvis-j5ei.onrender.com/';

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