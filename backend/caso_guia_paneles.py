"""Paneles fijos del caso guía de DARVIS: consultas, gráficos, lecturas e indicadores.

Python puro (no importa FastAPI ni Groq) para poder probarlo por separado.
Las cifras de las lecturas y de los indicadores salen de estas consultas DuckDB sobre las tablas
agregadas que carga backend/main.py. La única cifra fija es TOTAL_CLIENTES_MEDELLIN.
"""
import math
import re
import unicodedata

# Clientes de JFK con municipio Medellín. Mismo valor que en integracion_datos/build_base_integrada.py;
# ver integracion_datos/salida/calidad_integracion.md.
TOTAL_CLIENTES_MEDELLIN = 421049

# Consultas fijas, ya probadas contra los Parquet de integracion_datos/salida/. No cambiarlas sin volver a probarlas.
BASE = """WITH c AS (SELECT nombre_mostrar, comuna, cobertura_x1000 AS cob, pct_hacinamiento_sisben_2009_2020 AS hac, razon_oe AS oe, razon_oe_li AS oe_li, razon_oe_ls AS oe_ls, poblacion_2020 AS pob FROM base_integrada_comuna WHERE tipo = 'comuna' AND cobertura_x1000 IS NOT NULL AND razon_oe IS NOT NULL AND pct_hacinamiento_sisben_2009_2020 IS NOT NULL AND NOT muestra_baja), m AS (SELECT median(cob) AS med_cob, median(hac) AS med_hac FROM c), q AS (SELECT c.*, m.med_cob, m.med_hac, (cob < med_cob AND hac > med_hac) AS prioritaria, (cob < med_cob AND hac > med_hac AND oe < 1) AS candidata, greatest(0, round((med_cob - cob) * pob / 1000)) AS brecha FROM c, m)"""

SQL_EMBUDO = BASE + """ SELECT 1 AS orden, 'Comunas comparadas' AS etapa, count(*) AS comunas FROM q UNION ALL SELECT 2, 'Con baja cobertura y alta necesidad', count(*) FILTER (prioritaria) FROM q UNION ALL SELECT 3, 'Y con mora no mayor que la esperada (O/E menor que 1)', count(*) FILTER (candidata) FROM q ORDER BY orden"""

SQL_DISPERSION = BASE + """ SELECT nombre_mostrar, round(cob, 1) AS cobertura_x1000, round(hac, 1) AS pct_hacinamiento, round(oe, 3) AS razon_oe, round(med_cob, 1) AS med_cob, round(med_hac, 1) AS med_hac, prioritaria, candidata FROM q ORDER BY cob"""

SQL_INTERVALO = BASE + """ SELECT nombre_mostrar, round(oe, 3) AS razon_oe, round(oe_li, 3) AS razon_oe_li, round(oe_ls, 3) AS razon_oe_ls, candidata, (oe_li > 1 OR oe_ls < 1) AS distinta_de_1 FROM q ORDER BY oe"""

SQL_BRECHA = BASE + """ SELECT nombre_mostrar, brecha AS brecha_clientes, candidata FROM q WHERE prioritaria ORDER BY brecha DESC"""

SQL_ROBUSTEZ = BASE + """, i AS (SELECT varcharidcomunafk AS k, max(CASE WHEN "intaño" = 2018 THEN decimcv END) AS imcv_2018 FROM indice_multidimensional_calidad_vida GROUP BY 1) SELECT q.nombre_mostrar, round(q.hac, 1) AS pct_hacinamiento, round(i.imcv_2018, 1) AS imcv_2018, q.candidata, round(corr(q.hac, i.imcv_2018) OVER (), 2) AS r_pearson FROM q JOIN i ON i.k = q.comuna ORDER BY q.hac DESC"""

SQL_KPIS = BASE + """ SELECT count(*) AS comunas, count(*) FILTER (prioritaria) AS prioritarias, count(*) FILTER (candidata) AS candidatas, string_agg(nombre_mostrar, ' y ' ORDER BY cob) FILTER (candidata) AS nombres, sum(brecha) FILTER (candidata) AS brecha_candidatas, round(min(oe) FILTER (candidata), 3) AS oe_min, round(max(oe) FILTER (candidata), 3) AS oe_max, round(min(oe_li) FILTER (candidata), 2) AS li_min, round(max(oe_ls) FILTER (candidata), 2) AS ls_max, round(min(med_cob), 1) AS med_cob, round(min(cob) FILTER (candidata), 1) AS cob_min, round(max(cob) FILTER (candidata), 1) AS cob_max, (SELECT sum(clientes_jfk) FROM base_integrada_comuna) AS clientes_ubicados, (SELECT oficinas_por_100000_hab FROM contexto_medellin_sfc) AS oficinas_100k, (SELECT "Número de oficinas" FROM contexto_medellin_sfc) AS oficinas, (SELECT fecha_corte FROM contexto_medellin_sfc) AS fecha_corte FROM q"""

SIN_DATOS = "Sin datos para este panel."


def _es_nulo(valor):
    return valor is None or (isinstance(valor, float) and math.isnan(valor))


def _num(valor, decimales=0):
    """Número con formato es-CO: punto de miles y coma decimal."""
    if _es_nulo(valor):
        return "--"
    texto = f"{float(valor):,.{decimales}f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def _lista(nombres):
    """Une nombres como 'A', 'A y B' o 'A, B y C'."""
    nombres = [str(n) for n in nombres]
    if not nombres:
        return "ninguna"
    if len(nombres) == 1:
        return nombres[0]
    return ", ".join(nombres[:-1]) + " y " + nombres[-1]


def _fecha(valor):
    if _es_nulo(valor):
        return "--"
    return valor.strftime("%Y-%m-%d") if hasattr(valor, "strftime") else str(valor)[:10]


def _rango(minimo, maximo, decimales):
    """'a y b', o un solo valor si coinciden (una sola candidata)."""
    if _es_nulo(minimo) or _es_nulo(maximo):
        return "--"
    if float(minimo) == float(maximo):
        return _num(minimo, decimales)
    return f"{_num(minimo, decimales)} y {_num(maximo, decimales)}"


def _sentido_mora(fila):
    """Lado de 1 en que queda una razón O/E cuyo intervalo no incluye 1."""
    return "más" if float(fila["razon_oe"]) > 1 else "menos"


# ---------------------------------------------------------------------------
# Lecturas: una frase corta construida solo con los valores de las filas.
# ---------------------------------------------------------------------------
def _lectura_resumen(filas):
    if not filas:
        return SIN_DATOS
    f = filas[0]
    nombres = "ninguna" if _es_nulo(f["nombres"]) else f["nombres"]
    return (f"De {_num(f['comunas'])} comunas comparables, {_num(f['prioritarias'])} tienen baja cobertura y alta necesidad "
            f"y {_num(f['candidatas'])} son candidatas ({nombres}); a las candidatas les faltan "
            f"{_num(f['brecha_candidatas'])} clientes para llegar a la cobertura mediana.")


def _lectura_embudo(filas):
    conteos = [f["comunas"] for f in sorted(filas, key=lambda f: f["orden"])]
    if len(conteos) < 3:
        return SIN_DATOS
    return (f"De {_num(conteos[0])} comunas comparadas, {_num(conteos[1])} tienen baja cobertura y alta necesidad, "
            f"y {_num(conteos[2])} de ellas tienen además una mora no mayor que la esperada.")


def _lectura_dispersion(filas):
    if not filas:
        return SIN_DATOS
    prioritarias = [f for f in filas if f["prioritaria"]]
    candidatas = [f["nombre_mostrar"] for f in filas if f["candidata"]]
    verbo = "tienen" if len(candidatas) > 1 else "tiene"
    return (f"{_num(len(prioritarias))} de {_num(len(filas))} comunas están por debajo de la cobertura mediana "
            f"({_num(filas[0]['med_cob'], 1)} clientes por 1.000 hab.) y por encima del hacinamiento mediano "
            f"({_num(filas[0]['med_hac'], 1)} %); de ellas, {_lista(candidatas)} {verbo} además una mora no mayor que la esperada.")


def _lectura_intervalo(filas):
    if not filas:
        return SIN_DATOS
    distintas = [f"{f['nombre_mostrar']} ({_sentido_mora(f)} mora de la esperada)" for f in filas if f["distinta_de_1"]]
    if distintas:
        texto = f"En {_num(len(distintas))} de {_num(len(filas))} comunas el intervalo al 95 % no incluye 1: {_lista(distintas)}."
    else:
        texto = f"En las {_num(len(filas))} comunas el intervalo al 95 % incluye 1."
    candidatas = [f for f in filas if f["candidata"]]
    if candidatas:
        sin_1 = [f["nombre_mostrar"] for f in candidatas if f["distinta_de_1"]]
        if not sin_1:
            nombres = _lista([f["nombre_mostrar"] for f in candidatas])
            texto += f" En las candidatas ({nombres}) el intervalo incluye 1: su mora no se distingue de la esperada."
        else:
            texto += f" Entre las candidatas, el intervalo no incluye 1 en {_lista(sin_1)}."
    return texto


def _lectura_brecha(filas):
    if not filas:
        return SIN_DATOS
    total = sum(float(f["brecha_clientes"]) for f in filas)
    texto = (f"Las {_num(len(filas))} comunas de baja cobertura y alta necesidad necesitarían {_num(total)} clientes más "
             f"para llegar a la cobertura mediana")
    candidatas = [f for f in filas if f["candidata"]]
    if candidatas:
        total_candidatas = sum(float(f["brecha_clientes"]) for f in candidatas)
        detalle = _lista([f"{f['nombre_mostrar']} {_num(f['brecha_clientes'])}" for f in candidatas])
        texto += f"; las candidatas suman {_num(total_candidatas)} ({detalle})"
    return texto + "."


def _lectura_robustez(filas):
    if not filas or _es_nulo(filas[0]["r_pearson"]):
        return SIN_DATOS
    r = float(filas[0]["r_pearson"])
    sentido = "menor" if r < 0 else "mayor"
    texto = (f"En {_num(len(filas))} comunas, a más hacinamiento, {sentido} índice de calidad de vida 2018 "
             f"(correlación de Pearson {_num(r, 2)}).")
    candidatas = [f"{f['nombre_mostrar']} ({_num(f['imcv_2018'], 1)})" for f in filas if f["candidata"]]
    if candidatas:
        texto += f" IMCV 2018 de las candidatas: {_lista(candidatas)}."
    return texto


# ---------------------------------------------------------------------------
# Paneles. La pregunta de cada uno es la pregunta ancla exacta del chat.
# ---------------------------------------------------------------------------
PANELES = {
    "resumen": {
        "id": "resumen",
        "titulo": "Resumen de resultados del caso guía",
        "pregunta": "¿Cuál es el resumen de resultados del caso guía?",
        "sql": SQL_KPIS,
        "chart_spec": {"chart_type": "indicadores", "title": "Resumen de resultados del caso guía", "x_axis": "", "series": []},
        "lectura": _lectura_resumen,
    },
    "embudo": {
        "id": "embudo",
        "titulo": "Embudo de selección de comunas",
        "pregunta": "¿Cuántas comunas quedan al aplicar, una tras otra, las condiciones de baja cobertura, alta necesidad y mora no mayor a la esperada?",
        "sql": SQL_EMBUDO,
        "chart_spec": {
            "chart_type": "horizontal_bar",
            "title": "Embudo de selección de comunas",
            "x_axis": "etapa",
            "x_axis_label": "Etapa",
            "series": [{"key": "comunas", "label": "Comunas"}],
            "categories_top_down": True,
        },
        "lectura": _lectura_embudo,
    },
    "dispersion": {
        "id": "dispersion",
        "titulo": "Cobertura de JFK y hacinamiento por comuna",
        "pregunta": "¿Cómo se relacionan la cobertura de JFK y el hacinamiento en las 16 comunas y cuáles tienen baja cobertura con alta necesidad?",
        "sql": SQL_DISPERSION,
        "chart_spec": {
            "chart_type": "scatter",
            "title": "Cobertura de JFK y hacinamiento por comuna",
            "x_axis": "cobertura_x1000",
            "x_axis_label": "Clientes JFK por 1.000 habitantes",
            "y_axis_label": "Hacinamiento Sisbén 2009-2020 (%)",
            "series": [{"key": "pct_hacinamiento", "label": "Hacinamiento Sisbén 2009-2020 (%)"}],
            "label_key": "nombre_mostrar",
            "ref_x_key": "med_cob",
            "ref_y_key": "med_hac",
            "highlight_key": "candidata",
            "label_filter_key": "prioritaria",
        },
        "lectura": _lectura_dispersion,
    },
    "intervalo": {
        "id": "intervalo",
        "titulo": "Razón de mora observada frente a la esperada, con intervalo al 95 %",
        "pregunta": "¿Qué razón de mora observada frente a la esperada tiene cada comuna y con qué intervalo de confianza?",
        "sql": SQL_INTERVALO,
        "chart_spec": {
            "chart_type": "interval",
            "title": "Razón de mora observada frente a la esperada, con intervalo al 95 %",
            "x_axis": "nombre_mostrar",
            "x_axis_label": "Comuna",
            "y_axis_label": "Razón O/E de mora",
            "series": [{"key": "razon_oe", "label": "Razón O/E de mora"}],
            "low_key": "razon_oe_li",
            "high_key": "razon_oe_ls",
            "ref_value": 1,
            "categories_top_down": True,
            "highlight_key": "candidata",
        },
        "lectura": _lectura_intervalo,
    },
    "brecha": {
        "id": "brecha",
        "titulo": "Clientes que faltan para llegar a la cobertura mediana",
        "pregunta": "¿Cuántos clientes más necesitaría JFK en cada comuna de baja cobertura y alta necesidad para llegar a la cobertura mediana?",
        "sql": SQL_BRECHA,
        "chart_spec": {
            "chart_type": "horizontal_bar",
            "title": "Clientes que faltan para llegar a la cobertura mediana",
            "x_axis": "nombre_mostrar",
            "x_axis_label": "Comuna",
            "series": [{"key": "brecha_clientes", "label": "Clientes que faltan"}],
            "categories_top_down": True,
            "highlight_key": "candidata",
        },
        "lectura": _lectura_brecha,
    },
    "robustez": {
        "id": "robustez",
        "titulo": "Hacinamiento frente al índice de calidad de vida 2018",
        "pregunta": "¿Coinciden el hacinamiento y el índice de calidad de vida al identificar qué comunas tienen más necesidad?",
        "sql": SQL_ROBUSTEZ,
        "chart_spec": {
            "chart_type": "scatter",
            "title": "Hacinamiento frente al índice de calidad de vida 2018",
            "x_axis": "pct_hacinamiento",
            "x_axis_label": "Hacinamiento Sisbén 2009-2020 (%)",
            "y_axis_label": "IMCV 2018 (mayor = mejor calidad de vida)",
            "series": [{"key": "imcv_2018", "label": "IMCV 2018 (mayor = mejor calidad de vida)"}],
            "label_key": "nombre_mostrar",
            "highlight_key": "candidata",
            "label_filter_key": "candidata",
            "footer_key": "r_pearson",
            "footer_label": "Correlación de Pearson",
        },
        "lectura": _lectura_robustez,
    },
}

# Paneles con gráfico, en el orden en que se muestran.
PANELES_GRAFICOS = [pid for pid in PANELES if pid != "resumen"]

PREGUNTAS_ANCLA = [panel["pregunta"] for panel in PANELES.values()]


def armar_kpis(fila, filas_intervalo):
    """Los 6 indicadores del caso guía.

    fila: la única fila de SQL_KPIS. filas_intervalo: las filas de SQL_INTERVALO; se usan para decir
    si el intervalo de cada candidata incluye 1, algo que el mínimo y el máximo de SQL_KPIS no permiten saber.
    """
    candidatas_ic = [f for f in filas_intervalo if f["candidata"]]
    if not candidatas_ic:
        detalle_oe = "sin candidatas"
    elif not any(f["distinta_de_1"] for f in candidatas_ic):
        detalle_oe = "el intervalo incluye 1: sin evidencia de más mora"
    else:
        partes = []
        for f in candidatas_ic:
            if f["distinta_de_1"]:
                partes.append(f"{f['nombre_mostrar']}: {_sentido_mora(f)} mora de la esperada")
            else:
                partes.append(f"{f['nombre_mostrar']}: el intervalo incluye 1")
        detalle_oe = "; ".join(partes)

    ubicados = fila["clientes_ubicados"]
    pct_ubicados = None if _es_nulo(ubicados) else 100 * float(ubicados) / TOTAL_CLIENTES_MEDELLIN
    nombres = "ninguna" if _es_nulo(fila["nombres"]) else fila["nombres"]

    return [
        {
            "id": "candidatas",
            "titulo": "Comunas candidatas",
            "valor": f"{_num(fila['candidatas'])} de {_num(fila['comunas'])}",
            "detalle": nombres,
        },
        {
            "id": "brecha",
            "titulo": "Brecha de clientes",
            "valor": _num(fila["brecha_candidatas"]),
            "detalle": f"para llegar a la cobertura mediana ({_num(fila['med_cob'], 1)} por 1.000 hab.)",
        },
        {
            "id": "cobertura",
            "titulo": "Cobertura actual de las candidatas",
            "valor": _rango(fila["cob_min"], fila["cob_max"], 1),
            "detalle": "clientes por 1.000 habitantes",
        },
        {
            "id": "razon_oe",
            "titulo": "Razón O/E de mora",
            "valor": _rango(fila["oe_min"], fila["oe_max"], 3),
            "detalle": detalle_oe,
        },
        {
            "id": "ubicados",
            "titulo": "Clientes ubicados sin supuestos",
            "valor": "--" if pct_ubicados is None else f"{_num(pct_ubicados, 1)} %",
            "detalle": f"{_num(ubicados)} de {_num(TOTAL_CLIENTES_MEDELLIN)} clientes con municipio Medellín",
        },
        {
            "id": "oficinas",
            "titulo": "Oficinas financieras en Medellín",
            "valor": _num(fila["oficinas"]),
            "detalle": f"{_num(fila['oficinas_100k'], 1)} por 100.000 habitantes (Superfinanciera, corte {_fecha(fila['fecha_corte'])})",
        },
    ]


def normalizar(texto):
    """Minúsculas, sin tildes, sin signos de puntuación y con espacios colapsados."""
    if not isinstance(texto, str):
        return ""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", sin_tildes)).strip()


_POR_ANCLA = {normalizar(panel["pregunta"]): panel for panel in PANELES.values()}
assert len(_POR_ANCLA) == len(PANELES), "Dos preguntas ancla quedan iguales al normalizarlas"


def buscar_panel(pregunta):
    """Devuelve el panel cuya pregunta ancla coincide con la pregunta normalizada, o None."""
    return _POR_ANCLA.get(normalizar(pregunta))
