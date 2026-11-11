"""Prueba automática de las cifras del caso guía de DARVIS.

Uso, desde la raíz del repositorio y con el Python del proyecto:
    python backend/test_caso_guia.py

No usa pytest: carga las tablas igual que backend/main.py, revisa cada cifra con assert
y termina imprimiendo "OK". Si algo no cuadra, se detiene en el primer assert que falle.
"""
import os
import sys

sys.dont_write_bytecode = True  # no crear backend/__pycache__ al importar main
sys.stdout.reconfigure(encoding="utf-8")  # main.py imprime emojis al cargar las tablas
os.environ.pop("DARVIS_MODO", None)  # se prueba el modo por defecto (agregado)

import main  # noqa: E402
from caso_guia_paneles import (  # noqa: E402
    PANELES,
    PANELES_GRAFICOS,
    TOTAL_CLIENTES_MEDELLIN,
    armar_kpis,
    buscar_panel,
    normalizar,
)

CANDIDATAS = {"Doce de Octubre", "Villa Hermosa"}
FORMA_CHAT = {"status", "generated_sql", "row_count", "chart_spec", "data", "lectura"}


def revisar(descripcion, condicion, detalle=""):
    assert condicion, f"FALLA: {descripcion}. Obtenido: {detalle}"
    print(f"ok - {descripcion}")


def pasa_validacion(sql):
    try:
        main.validar_sql(sql)
        return True
    except main.HTTPException:
        return False


revisar("el modo por defecto es 'agregado'", not main.MODO_COMPLETO)
main.setup_database()

revisar("las 6 consultas fijas pasan validar_sql", all(pasa_validacion(p["sql"]) for p in PANELES.values()))
datos = {pid: main._ejecutar_consulta_fija(panel["sql"]) for pid, panel in PANELES.items()}

embudo = sorted(datos["embudo"], key=lambda f: f["orden"])
revisar("embudo = (16, 6, 2)", tuple(f["comunas"] for f in embudo) == (16, 6, 2), [f["comunas"] for f in embudo])

dispersion = datos["dispersion"]
revisar("dispersión: 16 filas", len(dispersion) == 16, len(dispersion))
revisar("dispersión: candidatas = Doce de Octubre y Villa Hermosa",
        {f["nombre_mostrar"] for f in dispersion if f["candidata"]} == CANDIDATAS,
        {f["nombre_mostrar"] for f in dispersion if f["candidata"]})
medianas = ({f["med_cob"] for f in dispersion}, {f["med_hac"] for f in dispersion})
revisar("dispersión: medianas 157,2 de cobertura y 14,8 de hacinamiento", medianas == ({157.2}, {14.8}), medianas)

brecha = datos["brecha"]
por_comuna = {f["nombre_mostrar"]: f["brecha_clientes"] for f in brecha}
revisar("brecha: 6 filas", len(brecha) == 6, len(brecha))
revisar("brecha: suma de las candidatas = 21584",
        sum(f["brecha_clientes"] for f in brecha if f["candidata"]) == 21584,
        sum(f["brecha_clientes"] for f in brecha if f["candidata"]))
revisar("brecha: Doce de Octubre = 15154 y Villa Hermosa = 6430",
        por_comuna.get("Doce de Octubre") == 15154 and por_comuna.get("Villa Hermosa") == 6430, por_comuna)

intervalo = datos["intervalo"]
revisar("intervalo: solo La América y Guayabal tienen un intervalo que no incluye 1",
        {f["nombre_mostrar"] for f in intervalo if f["distinta_de_1"]} == {"La América", "Guayabal"},
        {f["nombre_mostrar"] for f in intervalo if f["distinta_de_1"]})
revisar("intervalo: el de las candidatas incluye 1", not any(f["distinta_de_1"] for f in intervalo if f["candidata"]))

robustez = datos["robustez"]
revisar("robustez: 16 filas", len(robustez) == 16, len(robustez))
revisar("robustez: r de Pearson = -0,88", {f["r_pearson"] for f in robustez} == {-0.88}, {f["r_pearson"] for f in robustez})

revisar("indicadores: la consulta devuelve una sola fila", len(datos["resumen"]) == 1, len(datos["resumen"]))
fila = datos["resumen"][0]
revisar("indicadores: clientes_ubicados = 352783", fila["clientes_ubicados"] == 352783, fila["clientes_ubicados"])
revisar("indicadores: 83,8 % de 421.049",
        round(100 * fila["clientes_ubicados"] / TOTAL_CLIENTES_MEDELLIN, 1) == 83.8,
        round(100 * fila["clientes_ubicados"] / TOTAL_CLIENTES_MEDELLIN, 1))
revisar("indicadores: oficinas = 342", fila["oficinas"] == 342, fila["oficinas"])
tarjetas = armar_kpis(fila, intervalo)
valores = [t["valor"] for t in tarjetas]
revisar("indicadores: 6 tarjetas con 2 de 16, 21.584, 83,8 % y 342",
        len(tarjetas) == 6 and [valores[0], valores[1], valores[4], valores[5]] == ["2 de 16", "21.584", "83,8 %", "342"], valores)

salidas = [main._respuesta_panel(PANELES[pid]) for pid in PANELES_GRAFICOS]
resumen = main._respuesta_panel(PANELES["resumen"], con_kpis=True)
revisar("los 5 paneles responden con la forma de /chat más la lectura", all(FORMA_CHAT <= set(s) for s in salidas))
revisar("la respuesta del resumen trae los 6 indicadores", len(resumen.get("kpis", [])) == 6)
columnas_id = {c for s in salidas + [resumen] for f in s["data"] for c in f if c.upper().startswith("ID_")}
revisar("ninguna salida tiene columnas ID_*", not columnas_id, columnas_id)

for panel in PANELES.values():
    pregunta = panel["pregunta"]
    reconocida = (buscar_panel(pregunta) is panel
                  and buscar_panel(normalizar(pregunta)) is panel
                  and buscar_panel(f"  {pregunta.upper()}  ") is panel)
    revisar(f"ancla '{panel['id']}' reconocida con y sin tildes ni signos", reconocida)
revisar("la ancla del resumen escrita a mano sin tildes se reconoce",
        buscar_panel("cual es el resumen de resultados del caso guia") is PANELES["resumen"])
revisar("las paráfrasis no se reconocen",
        buscar_panel("dame el resumen del caso guia") is None
        and buscar_panel("¿Cuántas comunas quedan al aplicar las condiciones?") is None)

print("OK")
