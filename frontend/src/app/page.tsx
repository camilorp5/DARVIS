'use client';

import { useState } from 'react';
import { sendChatPrompt } from '@/lib/api';
import { ApiResponse } from '@/types';
import DynamicChart from '@/components/visualization/DynamicChart';
import { Send, Loader2, AlertCircle, Sparkles } from 'lucide-react';

export default function Home() {
  const [userPrompt, setUserPrompt] = useState('Muestra el total de hombres y mujeres por rango de edad');
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendPrompt = async () => {
    if (!userPrompt.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await sendChatPrompt(userPrompt);
      setApiResponse(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al comunicarse con el backend de DARVIS');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50/40 via-white to-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full tracking-wide uppercase flex items-center justify-center gap-1.5 w-fit mx-auto">
            <Sparkles className="w-3.5 h-3.5" />
            DARVIS AI - Engine Groq
          </span>
          <h1 className="text-3xl font-bold text-slate-900">Chatbot de Visualización Interactiva</h1>
          <p className="text-slate-600 max-w-lg mx-auto text-sm">
            Escribe tu consulta en lenguaje natural. Groq la traducirá a SQL y DuckDB la graficará en tiempo real.
          </p>
        </header>

        {/* Input de Chat */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            Pregunta al asistente:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
              placeholder="Ej: Muestra el saldo total por rango de edad..."
              className="flex-1 p-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
            <button
              onClick={handleSendPrompt}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Consultar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Gráfico devuelto dinámicamente por Groq + DuckDB */}
        {apiResponse && (
          <section className="flex justify-center">
            <DynamicChart response={apiResponse} />
          </section>
        )}
      </div>
    </main>
  );
}