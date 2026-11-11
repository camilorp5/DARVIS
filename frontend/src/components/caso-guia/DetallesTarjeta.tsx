'use client';

import { useState } from 'react';
import { formatoCO } from '@/components/visualization/DynamicChart';

// Encabezados legibles de las columnas de los paneles del caso guía; las demás se muestran sin guiones bajos.
const ENCABEZADOS: Record<string, string> = {
  orden: 'Orden',
  etapa: 'Etapa',
  comunas: 'Comunas',
  nombre_mostrar: 'Comuna',
  cobertura_x1000: 'Cobertura (clientes por 1.000 hab.)',
  pct_hacinamiento: 'Hacinamiento (%)',
  razon_oe: 'Razón O/E',
  razon_oe_li: 'Límite inferior',
  razon_oe_ls: 'Límite superior',
  med_cob: 'Mediana de cobertura',
  med_hac: 'Mediana de hacinamiento (%)',
  prioritaria: 'Baja cobertura y alta necesidad',
  candidata: 'Candidata',
  distinta_de_1: 'Intervalo sin el 1',
  brecha_clientes: 'Clientes que faltan',
  imcv_2018: 'IMCV 2018',
  r_pearson: 'r de Pearson',
};

const encabezado = (columna: string) => ENCABEZADOS[columna] ?? columna.replace(/_/g, ' ');

// Celdas: números en formato es-CO y booleanos en palabras.
const formatoCelda = (valor: unknown) => {
  if (valor === null || valor === undefined) return '--';
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no';
  return formatoCO(valor);
};

const claseBoton = (isDark: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? 'border-slate-700 bg-[#111827] text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;

type DetallesTarjetaProps = {
  titulo: string;
  lectura?: string;
  pregunta?: string;
  sql?: string;
  datos: Record<string, any>[];
  isDark: boolean;
  onPreguntar: (pregunta: string) => void;
  onCerrar: () => void;
};

// "Detalles" de una tarjeta del caso guía: se abre dentro de la tarjeta, sin cambiar su tamaño ni su posición.
export default function DetallesTarjeta({ titulo, lectura, pregunta, sql, datos, isDark, onPreguntar, onCerrar }: DetallesTarjetaProps) {
  const [verSql, setVerSql] = useState(false);
  const [verDatos, setVerDatos] = useState(false);
  const columnas = Object.keys(datos[0] ?? {});
  const textoSuave = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      role="region"
      aria-label={`Detalles: ${titulo}`}
      className={`absolute inset-0 z-10 flex flex-col rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-blue-100 bg-white text-slate-800'}`}
    >
      {/* Deja libre la esquina de los botones de la tarjeta (minimizar, maximizar, eliminar). */}
      <div className="flex min-w-0 items-center gap-2 pr-28">
        <h4 className="truncate text-sm font-semibold">Detalles</h4>
        <button type="button" onClick={onCerrar} className={claseBoton(isDark)}>
          Volver al gráfico
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {lectura && (
          <div>
            <p className={`text-xs ${textoSuave}`}>Lectura</p>
            <p className="text-sm leading-6">{lectura}</p>
          </div>
        )}
        {pregunta && (
          <div className="space-y-2">
            <p className={`text-xs ${textoSuave}`}>Pregunta en lenguaje natural</p>
            <p className="text-sm leading-6">{pregunta}</p>
            <button type="button" onClick={() => onPreguntar(pregunta)} className={claseBoton(isDark)}>
              Preguntar esto en el chat
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {sql && (
            <button type="button" aria-expanded={verSql} onClick={() => setVerSql((abierto) => !abierto)} className={claseBoton(isDark)}>
              {verSql ? 'Ocultar consulta SQL' : 'Ver consulta SQL'}
            </button>
          )}
          <button type="button" aria-expanded={verDatos} onClick={() => setVerDatos((abierto) => !abierto)} className={claseBoton(isDark)}>
            {verDatos ? 'Ocultar datos' : 'Ver datos'}
          </button>
        </div>
        {verSql && sql && (
          <pre
            className={`max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border p-3 font-mono text-[11px] leading-5 ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
          >
            {sql}
          </pre>
        )}
        {verDatos && (
          <div
            role="region"
            aria-label={`Datos: ${titulo}`}
            tabIndex={0}
            className={`max-h-64 overflow-auto rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
          >
            <table className="min-w-full text-left text-xs">
              <thead className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-600'}>
                <tr>
                  {columnas.map((columna) => (
                    <th key={columna} scope="col" className="whitespace-nowrap px-2 py-1.5 font-semibold">{encabezado(columna)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.map((fila, indice) => (
                  <tr key={indice} className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    {columnas.map((columna) => (
                      <td key={columna} className="whitespace-nowrap px-2 py-1.5">{formatoCelda(fila[columna])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
