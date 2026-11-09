"""
Caso guia "oportunidad territorial": consulta fija sobre la base integrada y resultado declarado.

Ejecutar desde la raiz del repo:
    integracion_datos/.venv/Scripts/python.exe integracion_datos/caso_guia.py

Solo lee integracion_datos/salida/base_integrada_comuna.parquet (agregados, sin identificadores).
"""
import os
import sys

import duckdb

sys.stdout.reconfigure(encoding="utf-8")

PARQUET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "salida", "base_integrada_comuna.parquet").replace("\\", "/")

CONSULTA = """WITH c AS (SELECT nombre_mostrar, cobertura_x1000, razon_oe, razon_oe_li, razon_oe_ls, pct_hacinamiento_sisben_2009_2020 AS pct_hacinamiento, clientes_jfk, poblacion_2020 FROM base_integrada_comuna WHERE tipo='comuna' AND cobertura_x1000 IS NOT NULL AND razon_oe IS NOT NULL AND pct_hacinamiento_sisben_2009_2020 IS NOT NULL AND NOT muestra_baja), m AS (SELECT median(cobertura_x1000) AS med_cob, median(pct_hacinamiento) AS med_hac FROM c) SELECT c.*, m.med_cob, m.med_hac, cobertura_x1000 < m.med_cob AS baja_cobertura, pct_hacinamiento > m.med_hac AS alta_necesidad, razon_oe < 1 AS mora_menor_que_esperada, razon_oe_ls < 1 AS mora_menor_ic, greatest(0, round((m.med_cob - cobertura_x1000) * poblacion_2020 / 1000)) AS brecha_clientes FROM c, m ORDER BY cobertura_x1000"""

# Misma consulta con la cobertura que incluye el supuesto CENTRO -> LA CANDELARIA.
CONSULTA_SENSIBILIDAD = CONSULTA.replace("cobertura_x1000", "cobertura_x1000_con_supuestos")


def entero(x):
    return f"{int(x):,}".replace(",", ".")


def decimal(x, d=2):
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def formato(columna, valor):
    if valor is None:
        return "--"
    if isinstance(valor, bool):
        return "si" if valor else "no"
    if columna == "brecha_clientes" or isinstance(valor, int):
        return entero(valor)
    if isinstance(valor, float):
        return decimal(valor, 4)
    return str(valor)


def es_candidata(f):
    return f["baja_cobertura"] and f["alta_necesidad"] and f["mora_menor_que_esperada"]


def imprimir_candidatas(lista, columna_cobertura):
    for f in lista:
        print(f"- {f['nombre_mostrar']}: cobertura {decimal(f[columna_cobertura])} por 1.000 habitantes (mediana {decimal(f['med_cob'])}); "
              f"hacinamiento Sisbén 2009-2020 {decimal(f['pct_hacinamiento'])} % (mediana {decimal(f['med_hac'])} %); "
              f"razón O/E {decimal(f['razon_oe'], 4)} (intervalo al 95 %: {decimal(f['razon_oe_li'], 4)} a {decimal(f['razon_oe_ls'], 4)}); "
              f"brecha de {entero(f['brecha_clientes'])} clientes.")
    if not lista:
        print("- Ninguna.")
    print()
    print(f"Brecha total de las candidatas: {entero(sum(f['brecha_clientes'] for f in lista))} clientes.")


def consultar(sql):
    cursor = con.execute(sql)
    nombres = [d[0] for d in cursor.description]
    return nombres, [dict(zip(nombres, fila)) for fila in cursor.fetchall()]


con = duckdb.connect()
con.execute(f"CREATE VIEW base_integrada_comuna AS SELECT * FROM read_parquet('{PARQUET}')")
columnas, filas = consultar(CONSULTA)
_, filas_sensibilidad = consultar(CONSULTA_SENSIBILIDAD)
con.close()

print("Tabla ordenada por cobertura")
print(" | ".join(columnas))
for fila in filas:
    print(" | ".join(formato(c, fila[c]) for c in columnas))

candidatas = [f for f in filas if es_candidata(f)]

print()
print("RESULTADO DECLARADO")
print(f"Candidatas: {len(candidatas)} de {len(filas)} comunas (cobertura bajo la mediana, hacinamiento sobre la mediana y razón O/E menor que 1).")
print()
imprimir_candidatas(candidatas, "cobertura_x1000")

candidatas_sensibilidad = [f for f in filas_sensibilidad if es_candidata(f)]
nombres_sensibilidad = {f["nombre_mostrar"] for f in candidatas_sensibilidad}
se_mantienen = [f["nombre_mostrar"] for f in candidatas if f["nombre_mostrar"] in nombres_sensibilidad]

print()
print("PRUEBA DE SENSIBILIDAD")
print("Misma consulta usando cobertura_x1000_con_supuestos, que incluye el supuesto CENTRO → LA CANDELARIA.")
print(f"Candidatas: {len(candidatas_sensibilidad)} de {len(filas_sensibilidad)} comunas.")
print()
imprimir_candidatas(candidatas_sensibilidad, "cobertura_x1000_con_supuestos")
print()
print(f"Candidatas del resultado principal que se mantienen: {', '.join(se_mantienen) if se_mantienen else 'ninguna'}.")
print()
print("Salvedades:")
print("- La cobertura compara clientes actuales con población proyectada a 2020.")
print("- Es una brecha de presencia, no de demanda.")
print("- Es una asociación, no una relación causal.")
print("- Los intervalos de la razón O/E incluyen o rozan 1.")
