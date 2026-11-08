import DemographicsChart from '@/components/visualization/DemographicsChart';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50/40 via-white to-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full tracking-wide uppercase">
            Darvis Agent UI
          </span>
          <h1 className="text-3xl font-bold text-slate-900">Visualizador Interactivo de SQL</h1>
          <p className="text-slate-600 max-w-md mx-auto text-sm">
            Prueba de concepto de renderizado dinámico con Apache ECharts y Tailwind CSS.
          </p>
        </header>

        <section className="flex justify-center">
          <DemographicsChart />
        </section>
      </div>
    </main>
  );
}