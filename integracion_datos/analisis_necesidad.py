"""Compara las dos medidas de necesidad por comuna: hacinamiento Sisbén e IMCV.

Responde dos preguntas con las 16 comunas comparables del caso guía:
  1. ¿Las dos medidas dicen lo mismo? (correlación, concordancia, ranking)
  2. ¿Cambian las comunas candidatas si se usa una u otra?

Solo usa DuckDB y la librería estándar. No lee tablas de JFK ni identificadores.
Escribe salida/analisis_necesidad.md y salida/analisis_necesidad.json.

Uso:  python integracion_datos/analisis_necesidad.py
      python integracion_datos/analisis_necesidad.py --imcv ruta/al/imcv.parquet
"""
import argparse
import json
import math
import os
import statistics
import sys

import duckdb

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "salida")


def pearson(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    return sxy / math.sqrt(sxx * syy)


def rangos(v):
    """Rangos 1..n con promedio en empates."""
    orden = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(orden):
        j = i
        while j + 1 < len(orden) and v[orden[j + 1]] == v[orden[i]]:
            j += 1
        for k in range(i, j + 1):
            r[orden[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def ic95(r, n):
    z, se = math.atanh(r), 1 / math.sqrt(n - 3)
    return math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)


def f(x, d=2):
    return f"{x:.{d}f}".replace(".", ",")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.path.join(SALIDA, "base_integrada_comuna.parquet"))
    ap.add_argument("--imcv", default=os.path.join(SALIDA, "indice_multidimensional_calidad_vida.parquet"))
    ap.add_argument("--salida", default=SALIDA)
    a = ap.parse_args()
    for ruta in (a.base, a.imcv):
        if not os.path.exists(ruta):
            sys.exit(f"Falta el archivo: {ruta}")

    con = duckdb.connect()
    # Mismo filtro que CASO_GUIA_SQL (backend/main.py e integracion_datos/caso_guia.py).
    filas = con.execute(
        """
        SELECT b.comuna, b.nombre_mostrar, b.cobertura_x1000, b.pct_hacinamiento_sisben_2009_2020,
               b.razon_oe, b.mora_observada, i.imcv_2018, i.imcv_media
        FROM read_parquet(?) b
        JOIN (SELECT varcharidcomunafk AS k,
                     max(CASE WHEN "intaño" = 2018 THEN decimcv END) AS imcv_2018,
                     avg(decimcv) AS imcv_media
              FROM read_parquet(?) GROUP BY 1) i ON i.k = b.comuna
        WHERE b.tipo = 'comuna' AND b.cobertura_x1000 IS NOT NULL AND b.razon_oe IS NOT NULL
          AND b.pct_hacinamiento_sisben_2009_2020 IS NOT NULL AND NOT b.muestra_baja
        ORDER BY b.cobertura_x1000
        """,
        [a.base, a.imcv],
    ).fetchall()
    n = len(filas)
    if n < 10:
        sys.exit(f"Solo {n} comunas comparables; revisa que las claves de comuna coincidan.")

    nom = [r[1] for r in filas]
    cob = [r[2] for r in filas]
    hac = [r[3] for r in filas]
    oe = [r[4] for r in filas]
    mora = [r[5] for r in filas]
    imcv = [r[6] for r in filas]
    imcv_m = [r[7] for r in filas]

    r_p = pearson(hac, imcv)
    r_s = pearson(rangos(hac), rangos(imcv))
    lo, hi = ic95(r_p, n)
    r_p_m = pearson(hac, imcv_m)

    med_cob, med_hac, med_imcv = statistics.median(cob), statistics.median(hac), statistics.median(imcv)
    alta_hac = [h > med_hac for h in hac]
    alta_imcv = [v < med_imcv for v in imcv]  # IMCV bajo = más necesidad
    concordan = sum(1 for p, q in zip(alta_hac, alta_imcv) if p == q)

    def candidatas(alta):
        cuad = [nom[i] for i in range(n) if cob[i] < med_cob and alta[i]]
        cand = [nom[i] for i in range(n) if cob[i] < med_cob and alta[i] and oe[i] < 1]
        return cuad, cand

    cuad_h, cand_h = candidatas(alta_hac)
    cuad_i, cand_i = candidatas(alta_imcv)

    # Puestos de necesidad: 1 = más necesidad.
    pos_h = [int(x) for x in rangos([-h for h in hac])]
    pos_i = [int(x) for x in rangos(imcv)]
    difs = sorted(((nom[i], pos_h[i], pos_i[i], pos_h[i] - pos_i[i]) for i in range(n)), key=lambda t: (-abs(t[3]), t[0]))

    rel = {
        "cobertura": (pearson(hac, cob), pearson(imcv, cob)),
        "razon_oe": (pearson(hac, oe), pearson(imcv, oe)),
        "mora_observada": (pearson(hac, mora), pearson(imcv, mora)),
    }

    mismas = set(cand_h) == set(cand_i)
    redundante = abs(r_s) >= 0.8 and mismas
    decision = (
        "Las dos medidas ordenan las comunas casi igual y las candidatas no cambian: "
        "se mantiene el hacinamiento como medida de necesidad y el IMCV queda como prueba de robustez."
        if redundante
        else "Las medidas difieren de forma relevante: revisar antes de elegir una."
    )

    res = {
        "comunas_comparadas": n,
        "pearson_hacinamiento_imcv2018": round(r_p, 4),
        "pearson_ic95": [round(lo, 4), round(hi, 4)],
        "pearson_hacinamiento_imcv_media_2011_2018": round(r_p_m, 4),
        "spearman_hacinamiento_imcv2018": round(r_s, 4),
        "r2": round(r_p ** 2, 4),
        "concordancia_sobre_bajo_mediana": [concordan, n],
        "medianas": {"cobertura": round(med_cob, 4), "hacinamiento": round(med_hac, 4), "imcv_2018": round(med_imcv, 4)},
        "cuadrante_hacinamiento": cuad_h,
        "candidatas_hacinamiento": cand_h,
        "cuadrante_imcv": cuad_i,
        "candidatas_imcv": cand_i,
        "mismas_candidatas": mismas,
        "relacion_con_jfk": {k: {"hacinamiento": round(v[0], 4), "imcv": round(v[1], 4)} for k, v in rel.items()},
        "puestos_necesidad": [{"comuna": c, "hacinamiento": ph, "imcv": pi, "diferencia": d} for c, ph, pi, d in difs],
        "decision": decision,
    }
    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, "analisis_necesidad.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    md = [
        "# Análisis de necesidad: hacinamiento Sisbén frente al IMCV",
        "",
        "Solo agregados por comuna. IMCV: mayor valor = mejor calidad de vida (deducido de los datos; confirmar en la ficha de MEData).",
        "",
        f"## 1. ¿Dicen lo mismo? ({n} comunas comparables)",
        "",
        "| Medida | Resultado |",
        "|---|---|",
        f"| Correlación hacinamiento vs IMCV 2018 (Pearson) | {f(r_p)} (IC 95 %: {f(lo)} a {f(hi)}); R² = {f(r_p ** 2)} |",
        f"| Correlación de rangos (Spearman) | {f(r_s)} |",
        f"| Correlación con el IMCV promedio 2011-2018 | {f(r_p_m)} |",
        f"| Concordancia (alta o baja necesidad en las dos) | {concordan} de {n} comunas |",
        "",
        "## 2. ¿Cambian las candidatas?",
        "",
        f"Medianas: cobertura {f(med_cob, 1)}, hacinamiento {f(med_hac, 1)} %, IMCV 2018 {f(med_imcv, 1)}.",
        "",
        "| Medida de necesidad | Baja cobertura y alta necesidad | Candidatas (razón O/E < 1) |",
        "|---|---|---|",
        f"| Hacinamiento | {', '.join(cuad_h) or '-'} | {', '.join(cand_h) or '-'} |",
        f"| IMCV | {', '.join(cuad_i) or '-'} | {', '.join(cand_i) or '-'} |",
        "",
        f"Mismas candidatas con ambas medidas: **{'sí' if mismas else 'no'}**.",
        "",
        "## 3. Relación de cada medida con los resultados de JFK",
        "",
        "| Variable de JFK | Pearson con hacinamiento | Pearson con IMCV |",
        "|---|---|---|",
    ]
    etiquetas = {"cobertura": "Cobertura (clientes por 1.000 hab.)", "razon_oe": "Razón O/E", "mora_observada": "Mora observada"}
    for k, (h_, i_) in rel.items():
        md.append(f"| {etiquetas[k]} | {f(h_)} | {f(i_)} |")
    md += [
        "",
        "Con 16 comunas, estas correlaciones son orientativas y sus diferencias son poco concluyentes.",
        "",
        "## 4. Puestos de necesidad (1 = más necesidad), ordenados por desacuerdo",
        "",
        "| Comuna | Hacinamiento | IMCV | Diferencia |",
        "|---|---|---|---|",
    ]
    md += [f"| {c} | {ph} | {pi} | {d:+d} |" for c, ph, pi, d in difs]
    md += ["", "## Decisión", "", decision, ""]
    with open(os.path.join(a.salida, "analisis_necesidad.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))

    print(f"Pearson {f(r_p)} (IC {f(lo)} a {f(hi)}), Spearman {f(r_s)}, concordancia {concordan}/{n}")
    print("Candidatas con hacinamiento:", ", ".join(cand_h) or "-")
    print("Candidatas con IMCV:", ", ".join(cand_i) or "-")
    print(decision)


if __name__ == "__main__":
    main()
