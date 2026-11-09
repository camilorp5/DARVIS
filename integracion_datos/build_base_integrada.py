"""
Construye la base integrada por comuna/corregimiento (caso guia "oportunidad territorial").

Ejecutar desde la raiz del repo:
    integracion_datos/.venv/Scripts/python.exe integracion_datos/build_base_integrada.py

Entradas de solo lectura: backend/data/processed/*.parquet e integracion_datos/fuentes/*.csv.
Salidas: integracion_datos/salida/. Solo agregados: nunca se imprime ni se guarda ID_ASOCIADO
ni ID_CREDITO. Los codigos (por ejemplo, LINEA) se usan como categorias sin interpretarlos.
"""
import hashlib
import os
import re
import sys

import duckdb

sys.stdout.reconfigure(encoding="utf-8")

PROC = "backend/data/processed"
FUENTES = "integracion_datos/fuentes"
SALIDA = "integracion_datos/salida"
PQ_FUENTES = f"{SALIDA}/fuentes_parquet"
MAPA_ANTERIOR = "integracion_datos/mapa_etiquetas_comuna.parquet"
CLIENTES = f"{PROC}/clientes.parquet"
CREDITOS = f"{PROC}/creditos.parquet"
SALDOS = f"{PROC}/saldos.parquet"
HAC = f"{FUENTES}/hacinamiento_barrio_sisben3.csv"
CIR = f"{FUENTES}/creditos_otorgados_mediante_circulos_solidarios.csv"
PRO = f"{FUENTES}/proyecciones_de_poblacion_medellin_2020.csv"
SFC = f"{FUENTES}/Saldo_de_las_captaciones_y_colocaciones_por_municipios_20261108.csv"

TOTAL_CLIENTES_MEDELLIN = 421049
ULTIMO_CORTE_ESPERADO = "2026-06-30"
MIN_DATOS_ESTRATO = 0.90
MIN_CELDA = 30
MIN_CLIENTES_SALDOS = 100
MIN_CONTEO = 10
CONTEOS = ["clientes_jfk", "clientes_jfk_con_supuestos", "clientes_con_saldos", "clientes_con_credito", "poblacion_2020", "hogares_sisben_2009_2020", "circulos_2016_2019"]
# Cada columna derivada se suprime cuando se suprime el conteo del que depende.
DERIVADAS = {"cobertura_x1000": "clientes_jfk", "cobertura_x1000_con_supuestos": "clientes_jfk_con_supuestos",
             "cobertura_credito_x1000": "clientes_con_credito",
             "pct_hacinamiento_sisben_2009_2020": "hogares_sisben_2009_2020"}
ADVERTENCIA = "mapeo por nombre menos confiable en corregimientos; no se interpreta como ausencia"

EQUIV_JFK = {"EL POBLADO": "POBLADO", "LAURELES - ESTADIO": "LAURELES-ESTADIO"}
# Solo para unir Proyecciones; no se aplica a etiquetas de JFK.
EQUIV_PROYECCIONES = {
    "El Poblado": "POBLADO",
    "Laureles - Estadio": "LAURELES-ESTADIO",
    "San Antonio": "SAN ANTONIO DE PRADO",
}
AMBIGUAS = ["SAN ANTONIO", "PAJARITO", "LA PALMA"]
ALIAS_VERIFICADOS = {
    "CAMPOAMOR": "CAMPO AMOR",
    "LOMA DE LOS BERNAL": "LA LOMA DE LOS BERNAL",
    "PLAYON DE LOS COMUNEROS": "EL PLAYON DE LOS COMUNEROS",
    "JUAN XXIII LA QUIEBRA": "JUAN XXIII - LA QUIEBRA",
    "VILLANIZA": "VILLA NIZA",
    "SAN JOSE LA CIMA NO.1": "SAN JOSE LA CIMA NO. 1",
    "CARPINELO": "EL CARPINELO",
    "BELENCITO CORAZON": "BELENCITO",
}
# SUPUESTO NO VERIFICABLE EN LOS DATOS: ninguna fuente confirma que CENTRO sea LA CANDELARIA.
# Por eso clientes_jfk lo excluye y clientes_jfk_con_supuestos lo incluye.
ALIAS_SUPUESTOS = {"CENTRO": "LA CANDELARIA"}
NOMBRE_MOSTRAR = {"POBLADO": "El Poblado", "LAURELES-ESTADIO": "Laureles - Estadio"}

APLICADOS = ["comuna_exacta", "barrio_hacinamiento", "prefijo_comuna", "alias_verificado"]
METODOS = APLICADOS + ["alias_supuesto", "ambiguo", "sin_mapeo", "sin_informacion"]
SQL_APLICADOS = ", ".join(f"'{m}'" for m in APLICADOS)
SQL_AMBIGUAS = ", ".join(f"'{e}'" for e in AMBIGUAS)
VACIOS = "('SIN_INFORMACION','SIN INFORMACION','NO DATO','SIN IDENTIFICAR','NAN','NULL','N/A','NA','ND','')"
CANDIDATAS_ESTRATO = [("RANGO_EDAD", "edad en rangos"), ("ESTRATO", "estrato"), ("LINEA", "código de línea")]
PATRON_COP = r"^-?[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$|^-?[0-9]+(,[0-9]+)?$"
SFC_VALORES = ["Cartera de créditos", "Microcréditos, garantía idónea", "Microcréditos, otras garantías"]
SFC_OFICINAS = "Número de oficinas"

# ---------------------------------------------------------------------------
# 0. Preparacion
# ---------------------------------------------------------------------------
assert os.path.isdir(PROC), "Ejecuta este script desde la raiz del repo."
os.makedirs(PQ_FUENTES, exist_ok=True)
if os.path.exists(MAPA_ANTERIOR):
    os.replace(MAPA_ANTERIOR, f"{SALIDA}/mapa_etiquetas_comuna.parquet")

con = duckdb.connect()  # base en memoria
con.execute("SET threads=1")  # un hilo para que los archivos sean identicos entre corridas
con.execute(f"SET temp_directory='{SALIDA}/.duckdb_tmp'")


def rows(sql, params=None):
    return con.execute(sql, params or []).fetchall()


def one(sql, params=None):
    return con.execute(sql, params or []).fetchone()


def q(columna):
    return '"' + columna.replace('"', '""') + '"'


def norm(x):
    return rf"strip_accents(upper(trim(regexp_replace(CAST({x} AS VARCHAR), '\s+', ' ', 'g'))))"


def leer_csv(ruta, extra=""):
    return f"read_csv('{ruta}', header=true, delim=',', sample_size=-1{extra})"


def copiar(sql, destino):
    con.execute(f"COPY ({sql}) TO '{destino}' (FORMAT parquet)")


def entero(x):
    return f"{x:,}".replace(",", ".")


def decimal(x, d=2):
    if x is None:
        return "--"
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(x):
    return decimal(100 * x) + " %"


def tabla(cabecera, filas):
    lineas = ["| " + " | ".join(cabecera) + " |", "|" + "---|" * len(cabecera)]
    lineas += ["| " + " | ".join(str(c) for c in fila) + " |" for fila in filas]
    return lineas + [""]


MEDELLIN = f"{norm('MUNICIPIO_DEPTO')} = 'MEDELLIN'"
ETIQUETA = f"coalesce({norm('BARRIO_COMUNA')}, 'SIN_INFORMACION')"

# El pipeline no elimina duplicados: si una llave se repite, se detiene aqui sin elegir por su cuenta.
filas, distintos = one(f"SELECT count(*), count(DISTINCT ID_CREDITO) FROM read_parquet('{CREDITOS}')")
assert filas == distintos, f"creditos: ID_CREDITO no es unico ({filas - distintos} filas de mas)"
repetidos = one(f"""SELECT count(*) FROM (SELECT ID_CREDITO, FECHA_CORTE FROM read_parquet('{SALDOS}')
                    GROUP BY 1, 2 HAVING count(*) > 1)""")[0]
assert repetidos == 0, f"saldos: {repetidos} pares credito-corte repetidos"

# ---------------------------------------------------------------------------
# Referencia territorial (hacinamiento)
# ---------------------------------------------------------------------------
con.execute(f"""CREATE TEMP TABLE hac_raw AS
SELECT Codigo_comuna, {norm('Comuna')} AS comuna, Comuna AS comuna_original, {norm('Barrio')} AS barrio,
       "Sin Hacinamiento" AS sin_h, "Con Hacinamiento" AS con_h, "Año" AS anio
FROM {leer_csv(HAC)}""")
con.execute("""CREATE TEMP TABLE territorios AS SELECT DISTINCT Codigo_comuna AS codigo, comuna, comuna_original
               FROM hac_raw WHERE Codigo_comuna <> 0""")
assert one("SELECT count(*) FROM territorios")[0] == 21, "Se esperaban 21 territorios"
assert one("SELECT count(*) FILTER (codigo < 50), count(*) FILTER (codigo >= 50) FROM territorios") == (16, 5), "Se esperaban 16 comunas y 5 corregimientos"
assert one("SELECT min(anio), max(anio) FROM hac_raw WHERE Codigo_comuna <> 0") == (2009, 2020), "Sisben: se esperaban los anios 2009 a 2020"
con.execute("""CREATE TEMP TABLE h AS SELECT DISTINCT comuna, barrio FROM hac_raw
               WHERE Codigo_comuna <> 0 AND barrio <> 'SIN IDENTIFICAR'""")
con.execute("CREATE TEMP TABLE barrio_unico AS SELECT barrio, min(comuna) AS comuna FROM h GROUP BY 1 HAVING count(*) = 1")
assert one("SELECT count(*) FROM barrio_unico")[0] == 259, "Se esperaban 259 barrios de una sola comuna"
con.execute("CREATE TEMP TABLE nombres AS SELECT comuna AS nombre, comuna FROM territorios")
con.executemany("INSERT INTO nombres VALUES (?, ?)", list(EQUIV_JFK.items()))
con.execute("CREATE TEMP TABLE nombres_mostrar (comuna VARCHAR, nombre VARCHAR)")
con.executemany("INSERT INTO nombres_mostrar VALUES (?, ?)", list(NOMBRE_MOSTRAR.items()))


def comunas_de_barrio(barrio):
    return [r[0] for r in rows("SELECT comuna FROM h WHERE barrio = ? ORDER BY 1", [barrio])]


filas_alias = []
for etiqueta, barrio in ALIAS_VERIFICADOS.items():
    comunas = comunas_de_barrio(barrio)
    assert len(comunas) == 1, f"Alias {etiqueta}: {barrio} no tiene comuna unica: {comunas}"
    filas_alias.append((etiqueta, comunas[0], "alias_verificado"))
assert comunas_de_barrio("BELENCITO") == ["SAN JAVIER"], "BELENCITO debe estar en SAN JAVIER"
assert comunas_de_barrio("EL CORAZON") == ["SAN JAVIER"], "EL CORAZON debe estar en SAN JAVIER"
for etiqueta, comuna in ALIAS_SUPUESTOS.items():
    assert one("SELECT count(*) FROM territorios WHERE comuna = ?", [comuna])[0] == 1
    filas_alias.append((etiqueta, comuna, "alias_supuesto"))
con.execute("CREATE TEMP TABLE alias (etiqueta VARCHAR, comuna VARCHAR, metodo VARCHAR)")
con.executemany("INSERT INTO alias VALUES (?, ?, ?)", filas_alias)


def clasificar(origen, destino, comuna_nn=False):
    """Aplica las reglas en orden a una tabla con una fila por etiqueta."""
    nn = "n.comuna" if comuna_nn else "NULL"
    join_nn = ""
    if comuna_nn:
        join_nn = ("LEFT JOIN territorios n ON "
                   "TRY_CAST(regexp_extract(e.etiqueta, '^COMUNA ([0-9]+)( |$)', 1) AS INTEGER) = n.codigo")
    con.execute(f"""CREATE TEMP TABLE {destino} AS
    SELECT e.etiqueta,
      CASE WHEN t.comuna IS NOT NULL THEN t.comuna
           WHEN e.etiqueta IN ({SQL_AMBIGUAS}) THEN NULL
           WHEN b.comuna IS NOT NULL THEN b.comuna
           WHEN p.comuna IS NOT NULL THEN p.comuna
           WHEN a.comuna IS NOT NULL THEN a.comuna
           WHEN {nn} IS NOT NULL THEN {nn}
      END AS comuna,
      CASE WHEN t.comuna IS NOT NULL THEN 'comuna_exacta'
           WHEN e.etiqueta IN ({SQL_AMBIGUAS}) THEN 'ambiguo'
           WHEN b.comuna IS NOT NULL THEN 'barrio_hacinamiento'
           WHEN p.comuna IS NOT NULL THEN 'prefijo_comuna'
           WHEN a.metodo IS NOT NULL THEN a.metodo
           WHEN {nn} IS NOT NULL THEN 'comuna_codigo'
           WHEN e.etiqueta = 'SIN_INFORMACION' THEN 'sin_informacion'
           ELSE 'sin_mapeo'
      END AS metodo
    FROM {origen} e
    LEFT JOIN nombres t ON e.etiqueta = t.nombre
    LEFT JOIN barrio_unico b ON e.etiqueta = b.barrio
    LEFT JOIN (SELECT e2.etiqueta, arg_max(t2.comuna, length(t2.nombre)) AS comuna
               FROM {origen} e2 JOIN nombres t2 ON starts_with(e2.etiqueta, t2.nombre || ' ')
               GROUP BY 1) p ON e.etiqueta = p.etiqueta
    LEFT JOIN alias a ON e.etiqueta = a.etiqueta
    {join_nn}""")


# ---------------------------------------------------------------------------
# 1. Mapa de etiquetas de JFK
# ---------------------------------------------------------------------------
con.execute(f"CREATE TEMP TABLE et_jfk AS SELECT DISTINCT {ETIQUETA} AS etiqueta FROM read_parquet('{CLIENTES}') WHERE {MEDELLIN}")
clasificar("et_jfk", "mapa")
copiar("SELECT etiqueta, comuna, metodo FROM mapa ORDER BY etiqueta", f"{SALIDA}/mapa_etiquetas_comuna.parquet")

con.execute(f"""CREATE TEMP TABLE cli AS
SELECT c.ID_ASOCIADO AS id, m.etiqueta, m.comuna, m.metodo, c.RANGO_EDAD, c.ESTRATO
FROM read_parquet('{CLIENTES}') c JOIN mapa m ON {ETIQUETA} = m.etiqueta
WHERE {MEDELLIN}""")
assert one("SELECT count(*) - count(DISTINCT id) FROM cli")[0] == 0, "cli: hay clientes repetidos; el intervalo agrupa por cliente"

# ---------------------------------------------------------------------------
# 2. Base integrada
# ---------------------------------------------------------------------------
con.execute(f"""CREATE TEMP TABLE pro AS
SELECT tipo_division_geografica AS tipo, trim(codigo) AS codigo, trim(grupo_edad) AS grupo_edad, total_2020
FROM {leer_csv(PRO)}""")
con.execute("CREATE TEMP TABLE nombres_proyecciones (codigo VARCHAR, comuna VARCHAR)")
con.executemany("INSERT INTO nombres_proyecciones VALUES (?, ?)", list(EQUIV_PROYECCIONES.items()))
con.execute(f"""CREATE TEMP TABLE pob AS
SELECT coalesce(n.comuna, {norm('p.codigo')}) AS comuna, p.total_2020 AS poblacion_2020
FROM pro p LEFT JOIN nombres_proyecciones n ON p.codigo = n.codigo
WHERE p.grupo_edad = 'Total' AND p.codigo NOT IN ('Suma Comunas', 'Suma Corregimientos', 'Total Medellín')""")
assert one("SELECT count(*) FROM pob p JOIN territorios t USING (comuna)")[0] == 21, "Proyecciones no une con los 21 territorios"
TOTAL_POBLACION = one("SELECT total_2020 FROM pro WHERE grupo_edad = 'Total' AND codigo = 'Total Medellín'")[0]

con.execute(f"CREATE TEMP TABLE cir AS SELECT {norm('barrio')} AS etiqueta FROM {leer_csv(CIR)} WHERE barrio IS NOT NULL")
con.execute("CREATE TEMP TABLE et_cir AS SELECT DISTINCT etiqueta FROM cir")
clasificar("et_cir", "mapa_cir", comuna_nn=True)
con.execute("CREATE TEMP TABLE cir_m AS SELECT m.comuna, m.metodo FROM cir c JOIN mapa_cir m USING (etiqueta)")
CIR_SIN_BARRIO = one(f"SELECT count(*) FROM {leer_csv(CIR)} WHERE barrio IS NULL")[0]

# Registros credito-corte de clientes con territorio aplicado (sin el supuesto).
con.execute(f"""CREATE TEMP TABLE reg AS
SELECT cli.id, cli.comuna, cli.RANGO_EDAD, cli.ESTRATO, cr.LINEA, s.DIAS_MORA
FROM read_parquet('{SALDOS}') s
JOIN read_parquet('{CREDITOS}') cr ON s.ID_CREDITO = cr.ID_CREDITO
JOIN cli ON cr.ID_ASOCIADO = cli.id
WHERE cli.metodo IN ({SQL_APLICADOS})""")
REG_TOTAL = one("SELECT count(*) FROM reg")[0]
REG_NULOS = one("SELECT count(*) FROM reg WHERE DIAS_MORA IS NULL")[0]  # el pipeline convierte 999 en nulo

# Variables de estandarizacion: maximo 3, con 90 % o mas de datos.
completitud = []
for columna, nombre in CANDIDATAS_ESTRATO:
    con_dato, total = one(f"SELECT count(*) FILTER ({norm(columna)} NOT IN {VACIOS}), count(*) FROM reg WHERE DIAS_MORA IS NOT NULL")
    completitud.append((columna, nombre, con_dato / total))
variables = [c for c, _, p in completitud if p >= MIN_DATOS_ESTRATO]
assert variables, "Ninguna variable cumple el minimo de datos para estandarizar"
celda_cruda = "concat_ws(' | ', " + ", ".join(f"coalesce(CAST({v} AS VARCHAR), 'SIN_INFORMACION')" for v in variables) + ")"

con.execute(f"CREATE TEMP TABLE reg_mora AS SELECT id, comuna, {celda_cruda} AS celda_cruda, DIAS_MORA > 30 AS en_mora FROM reg WHERE DIAS_MORA IS NOT NULL")
con.execute("CREATE TEMP TABLE celdas_crudas AS SELECT celda_cruda, count(*) AS n FROM reg_mora GROUP BY 1")
con.execute(f"""CREATE TEMP TABLE reg_celda AS
SELECT r.id, r.comuna, CASE WHEN c.n < {MIN_CELDA} THEN 'otros' ELSE r.celda_cruda END AS celda, r.en_mora
FROM reg_mora r JOIN celdas_crudas c USING (celda_cruda)""")
con.execute("""CREATE TEMP TABLE celdas AS
SELECT celda, count(*) AS registros, sum(en_mora::INTEGER)::BIGINT AS en_mora,
       sum(en_mora::INTEGER)::DOUBLE / count(*) AS tasa
FROM reg_celda GROUP BY 1""")
copiar("SELECT celda, registros, round(tasa, 6) AS tasa_mora FROM celdas ORDER BY celda", f"{SALIDA}/celdas_estandarizacion.parquet")
con.execute("""CREATE TEMP TABLE mora AS
SELECT x.comuna, sum(x.n)::BIGINT AS registros, sum(x.obs)::BIGINT AS observados, sum(x.n * c.tasa) AS esperados
FROM (SELECT comuna, celda, count(*) AS n, sum(en_mora::INTEGER) AS obs FROM reg_celda GROUP BY 1, 2) x
JOIN celdas c USING (celda) GROUP BY 1""")
# Intervalo al 95 % de O/E con agrupamiento por cliente. La tabla ic no guarda IDs.
con.execute("""CREATE TEMP TABLE ic AS
WITH por_cliente AS (
    SELECT r.comuna, r.id, sum(r.en_mora::INTEGER)::DOUBLE AS o_i, sum(c.tasa) AS e_i
    FROM reg_celda r JOIN celdas c USING (celda) GROUP BY 1, 2),
tot AS (SELECT comuna, sum(o_i) / sum(e_i) AS razon, sum(e_i) AS suma_e FROM por_cliente GROUP BY 1),
dis AS (SELECT p.comuna, sqrt(sum(pow(p.o_i - t.razon * p.e_i, 2))) / any_value(t.suma_e) AS se
        FROM por_cliente p JOIN tot t USING (comuna) GROUP BY 1)
SELECT t.comuna, t.razon, t.razon - 1.96 * d.se AS li, t.razon + 1.96 * d.se AS ls
FROM tot t JOIN dis d USING (comuna)""")
assert one("SELECT count(*) FROM ic JOIN mora m USING (comuna) WHERE abs(ic.razon - m.observados::DOUBLE / m.esperados) > 1e-9")[0] == 0, "IC: la razon por cliente no coincide con razon_oe"

con.execute(f"""CREATE TEMP TABLE base AS
WITH cl AS (
    SELECT comuna, count(DISTINCT id) FILTER (metodo IN ({SQL_APLICADOS})) AS clientes_jfk,
           count(DISTINCT id) AS clientes_jfk_con_supuestos
    FROM cli WHERE comuna IS NOT NULL GROUP BY 1),
sa AS (SELECT comuna, count(DISTINCT id) AS clientes_con_saldos FROM reg GROUP BY 1),
cc AS (SELECT cli.comuna, count(DISTINCT cli.id) AS clientes_con_credito
       FROM cli JOIN read_parquet('{CREDITOS}') cr ON cr.ID_ASOCIADO = cli.id
       WHERE cli.metodo IN ({SQL_APLICADOS}) GROUP BY 1),
ha AS (SELECT comuna, sum(sin_h + con_h)::BIGINT AS hogares_sisben_2009_2020,
              100.0::DOUBLE * sum(con_h)::DOUBLE / NULLIF(sum(sin_h + con_h)::DOUBLE, 0) AS pct
       FROM hac_raw WHERE Codigo_comuna <> 0 GROUP BY 1),
ci AS (SELECT comuna, count(*) AS circulos FROM cir_m WHERE comuna IS NOT NULL AND metodo <> 'alias_supuesto' GROUP BY 1)
SELECT t.comuna,
       coalesce(nm.nombre, t.comuna_original) AS nombre_mostrar,
       CASE WHEN t.codigo < 50 THEN 'comuna' ELSE 'corregimiento' END AS tipo,
       coalesce(cl.clientes_jfk, 0) AS clientes_jfk,
       coalesce(cl.clientes_jfk_con_supuestos, 0) AS clientes_jfk_con_supuestos,
       coalesce(sa.clientes_con_saldos, 0) AS clientes_con_saldos,
       coalesce(cc.clientes_con_credito, 0) AS clientes_con_credito,
       p.poblacion_2020,
       round(1000.0::DOUBLE * coalesce(cl.clientes_jfk, 0) / NULLIF(p.poblacion_2020, 0), 4) AS cobertura_x1000,
       round(1000.0::DOUBLE * coalesce(cl.clientes_jfk_con_supuestos, 0) / NULLIF(p.poblacion_2020, 0), 4) AS cobertura_x1000_con_supuestos,
       round(1000.0::DOUBLE * coalesce(cc.clientes_con_credito, 0) / NULLIF(p.poblacion_2020, 0), 4) AS cobertura_credito_x1000,
       ha.hogares_sisben_2009_2020,
       round(ha.pct, 4) AS pct_hacinamiento_sisben_2009_2020,
       coalesce(ci.circulos, 0) AS circulos_2016_2019,
       round(m.observados::DOUBLE / NULLIF(m.registros, 0), 6) AS mora_observada,
       round(m.esperados / NULLIF(m.registros, 0), 6) AS mora_esperada,
       round(m.observados::DOUBLE / NULLIF(m.esperados, 0), 4) AS razon_oe,
       round(ic.li, 4) AS razon_oe_li,
       round(ic.ls, 4) AS razon_oe_ls,
       coalesce(sa.clientes_con_saldos, 0) < {MIN_CLIENTES_SALDOS} AS muestra_baja,
       CASE WHEN t.codigo >= 50 THEN '{ADVERTENCIA}' END AS advertencia
FROM territorios t
JOIN pob p ON t.comuna = p.comuna
LEFT JOIN nombres_mostrar nm ON t.comuna = nm.comuna
LEFT JOIN cl ON t.comuna = cl.comuna
LEFT JOIN sa ON t.comuna = sa.comuna
LEFT JOIN cc ON t.comuna = cc.comuna
LEFT JOIN ha ON t.comuna = ha.comuna
LEFT JOIN ci ON t.comuna = ci.comuna
LEFT JOIN mora m ON t.comuna = m.comuna
LEFT JOIN ic ON t.comuna = ic.comuna""")
assert one("SELECT count(*), count(DISTINCT comuna) FROM base") == (21, 21), "La base debe tener una fila por territorio"
# Confidencialidad: `base` queda sin suprimir solo para las comprobaciones internas; se publica base_publica.
cond_suprimido = " OR ".join(f"{c} < {MIN_CONTEO}" for c in CONTEOS)
reemplazos = [f"CASE WHEN {c} < {MIN_CONTEO} THEN NULL ELSE {c} END AS {c}" for c in CONTEOS]
reemplazos += [f"CASE WHEN {n} < {MIN_CONTEO} THEN NULL ELSE {c} END AS {c}" for c, n in DERIVADAS.items()]
con.execute(f"CREATE TEMP TABLE base_publica AS SELECT * REPLACE ({', '.join(reemplazos)}), coalesce(({cond_suprimido}), false) AS dato_suprimido FROM base")
columnas_suprimidas = "concat_ws(', ', " + ", ".join(f"CASE WHEN {c} < {MIN_CONTEO} THEN '{c}' END" for c in CONTEOS) + ")"
afectados = rows(f"SELECT nombre_mostrar, {columnas_suprimidas} FROM base WHERE {cond_suprimido} ORDER BY comuna")
copiar("SELECT * FROM base_publica ORDER BY comuna", f"{SALIDA}/base_integrada_comuna.parquet")

# ---------------------------------------------------------------------------
# 3. Contexto SFC y 4. Fuentes en parquet
# ---------------------------------------------------------------------------
col_municipio, col_fecha = q("Nombre del municipio"), q("Fecha de Corte")
origen_sfc = leer_csv(SFC, ", all_varchar=true")
con.execute(f"""CREATE TEMP TABLE sfc AS SELECT * FROM {origen_sfc}
WHERE {norm(col_municipio)} = 'MEDELLIN' AND {norm(col_municipio)} NOT LIKE 'TOTAL%'""")
x_fecha = f"trim({col_fecha})"
con.execute(f"""CREATE TEMP TABLE sfc_fecha AS
SELECT *, coalesce(try_strptime({x_fecha}, '%Y-%m-%d'), try_strptime({x_fecha}, '%m/%d/%Y'), try_strptime({x_fecha}, '%d/%m/%Y'))::DATE AS fecha_corte
FROM sfc""")
fechas_nulas, cortes_distintos = one("SELECT count(*) FILTER (fecha_corte IS NULL), count(DISTINCT fecha_corte) FROM sfc_fecha")
assert fechas_nulas == 0, f"datos.gov.co: {fechas_nulas} fechas de corte sin interpretar"
assert cortes_distintos == 82, f"datos.gov.co: se esperaban 82 cortes y hay {cortes_distintos}"
con.execute("CREATE TEMP TABLE sfc_ult AS SELECT * FROM sfc_fecha WHERE fecha_corte = (SELECT max(fecha_corte) FROM sfc_fecha)")


def a_numero(columna):
    """Convierte formato colombiano (1.234.567,89) a numero."""
    return f"CAST(replace(replace(trim({q(columna)}), '.', ''), ',', '.') AS DECIMAL(38,4))"


for columna in SFC_VALORES + [SFC_OFICINAS]:
    malos = one(f"SELECT count(*) FROM sfc_ult WHERE {q(columna)} IS NULL OR NOT regexp_matches(trim({q(columna)}), ?)", [PATRON_COP])[0]
    assert malos == 0, f"{columna}: {malos} valores sin formato colombiano reconocible"

sumas_sfc = ", ".join(f"sum({a_numero(c)}) AS {q(c)}" for c in SFC_VALORES)
copiar(f"""SELECT fecha_corte, {sumas_sfc},
       sum({a_numero(SFC_OFICINAS)})::BIGINT AS {q(SFC_OFICINAS)},
       round(sum({a_numero(SFC_OFICINAS)})::DOUBLE * 100000 / {TOTAL_POBLACION}, 4) AS oficinas_por_100000_hab
FROM sfc_ult GROUP BY 1""", f"{SALIDA}/contexto_medellin_sfc.parquet")
ULTIMO_CORTE = str(one("SELECT max(fecha_corte) FROM sfc_fecha")[0])

copiar(f"SELECT * FROM {leer_csv(HAC)} ORDER BY ALL", f"{PQ_FUENTES}/hacinamiento.parquet")
copiar(f"SELECT * FROM {leer_csv(PRO)} ORDER BY ALL", f"{PQ_FUENTES}/proyecciones.parquet")
copiar(f"SELECT barrio, fecha_colocacion FROM {leer_csv(CIR)} ORDER BY ALL", f"{PQ_FUENTES}/circulos.parquet")
copiar("SELECT * FROM sfc ORDER BY ALL", f"{PQ_FUENTES}/datosgov_medellin.parquet")

# ---------------------------------------------------------------------------
# 5. Calidad y comprobaciones
# ---------------------------------------------------------------------------
cobertura = {m: one("SELECT (SELECT count(*) FROM mapa WHERE metodo = ?), count(DISTINCT id) FROM cli WHERE metodo = ?", [m, m]) for m in METODOS}
N = sum(c for _, c in cobertura.values())
SIN_INFO = cobertura["sin_informacion"][1]
CON_BARRIO = N - SIN_INFO
assert one("SELECT count(*) FROM mapa WHERE metodo NOT IN (" + ", ".join(f"'{m}'" for m in METODOS) + ")")[0] == 0

con.execute("""CREATE TEMP TABLE rk AS
SELECT comuna, nombre_mostrar, cobertura_x1000, cobertura_x1000_con_supuestos, razon_oe, muestra_baja,
       CASE WHEN tipo = 'comuna' THEN row_number() OVER (PARTITION BY tipo ORDER BY cobertura_x1000 DESC NULLS LAST, comuna) END AS pos_sin,
       CASE WHEN tipo = 'comuna' THEN row_number() OVER (PARTITION BY tipo ORDER BY cobertura_x1000_con_supuestos DESC NULLS LAST, comuna) END AS pos_con
FROM base_publica""")
ranking = rows("""SELECT nombre_mostrar, pos_sin, cobertura_x1000, pos_con, cobertura_x1000_con_supuestos, razon_oe, muestra_baja
                  FROM rk ORDER BY pos_sin NULLS LAST, comuna""")
cambian = [r[0] for r in ranking if r[1] != r[3]]

md = ["# Calidad de la integración [PRELIMINAR]", "",
      "Solo agregados, sin identificadores. Los códigos se usan como categorías, sin interpretar su significado.", ""]
md += ["## 1. Cobertura del mapeo por método", ""]
filas_md = []
for m in METODOS:
    e, c = cobertura[m]
    filas_md.append((m, entero(e), entero(c), pct(c / N), "--" if m == "sin_informacion" else pct(c / CON_BARRIO)))
aplicados = sum(cobertura[m][1] for m in APLICADOS)
filas_md.append(("**aplicado, sin supuestos**", entero(sum(cobertura[m][0] for m in APLICADOS)), entero(aplicados), pct(aplicados / N), pct(aplicados / CON_BARRIO)))
md += tabla(["Método", "Etiquetas", "Clientes", "% sobre Medellín", "% sobre los que tienen barrio"], filas_md)
md += ["**Supuesto documentado:** `CENTRO → LA CANDELARIA` (`alias_supuesto`) es un supuesto no verificable en los datos. "
       f"Afecta a {entero(cobertura['alias_supuesto'][1])} clientes, que solo cuentan en `clientes_jfk_con_supuestos`.", ""]

md += ["## 2. Etiquetas sin_mapeo con más clientes (máximo 30, con 10 o más)", ""]
md += tabla(["Etiqueta", "Clientes"], [(e, entero(c)) for e, c in rows("""SELECT etiqueta, count(DISTINCT id) FROM cli WHERE metodo = 'sin_mapeo'
    GROUP BY 1 HAVING count(DISTINCT id) >= 10 ORDER BY 2 DESC, 1 LIMIT 30""")])

n_celdas, n_registros = one("SELECT count(*), sum(registros)::BIGINT FROM celdas")
otros = one("SELECT registros FROM celdas WHERE celda = 'otros'")
n_agrupadas = one(f"SELECT count(*) FROM celdas_crudas WHERE n < {MIN_CELDA}")[0]
md += ["## 3. Celdas de estandarización", ""]
md += tabla(["Variable candidata", "Con dato", "¿Se usa?"], [(n, pct(p), "sí" if p >= MIN_DATOS_ESTRATO else "no") for _, n, p in completitud])
md += [f"- Variables usadas: {', '.join(variables)}.",
       "- Referencia: los registros crédito-corte de los 21 territorios, sin el supuesto.",
       f"- Celdas finales: {entero(n_celdas)}, sobre {entero(n_registros)} registros.",
       f"- Celdas con menos de {MIN_CELDA} registros agrupadas en `otros`: {entero(n_agrupadas)} ({entero(otros[0]) if otros else 0} registros).",
       "- Se muestran las 100 celdas con más registros. La tabla completa está en `celdas_estandarizacion.parquet`.", ""]
md += tabla(["Celda", "Registros", "Tasa de mora"], [(c.replace(" | ", " / "), entero(n), pct(t)) for c, n, t in rows("SELECT celda, registros, tasa FROM celdas ORDER BY registros DESC, celda LIMIT 100")])

md += ["## 4. Sensibilidad: ranking por cobertura con y sin el supuesto", ""]
md += tabla(["Territorio", "Posición sin", "Cobertura sin (x1000)", "Posición con", "Cobertura con (x1000)", "¿Cambia?"],
            [(r[0], "--" if r[1] is None or r[2] is None else r[1], decimal(r[2]), "--" if r[3] is None or r[4] is None else r[3], decimal(r[4]), "sí" if r[1] != r[3] else "no") for r in ranking])
md += [f"Territorios que cambian de posición: {', '.join(cambian) if cambian else 'ninguno'}.", ""]
candelaria = next(r for r in ranking if r[0] == "La Candelaria")
md += [f"**Nota:** La Candelaria depende del supuesto no verificable `CENTRO → LA CANDELARIA`: puesto {candelaria[1]} ({decimal(candelaria[2])}) sin él y puesto {candelaria[3]} ({decimal(candelaria[4])}) con él.", ""]

md += ["## 5. Círculos solidarios por método", "", f"Filas sin barrio, no mapeables: {entero(CIR_SIN_BARRIO)}.", ""]
md += tabla(["Método", "Filas"], [(m, entero(c)) for m, c in rows("SELECT metodo, count(*) FROM cir_m GROUP BY 1 ORDER BY 2 DESC, 1")])

guion = rows(f"""SELECT {norm('MUNICIPIO_DEPTO')}, count(*) FROM read_parquet('{CLIENTES}')
WHERE {norm('MUNICIPIO_DEPTO')} IN (SELECT trim(split_part(barrio, '-', 2)) FROM h WHERE contains(barrio, '-')
                                    UNION SELECT trim(split_part(comuna, '-', 2)) FROM territorios WHERE contains(comuna, '-'))
GROUP BY 1 HAVING count(*) >= 10 ORDER BY 2 DESC, 1""")
min_2020, max_2020 = one("""SELECT min(n), max(n) FROM (SELECT comuna, sum(sin_h + con_h)::BIGINT AS n
                            FROM hac_raw WHERE anio = 2020 AND Codigo_comuna <> 0 GROUP BY 1)""")
texto_min_2020 = f"menos de {MIN_CONTEO}" if min_2020 < MIN_CONTEO else entero(min_2020)
md += ["## 6. Notas y límites", "",
       f"- `saldos` solo cubre los créditos con cortes en su ventana. La mora se calcula sobre {entero(REG_TOTAL - REG_NULOS)} registros crédito-corte.",
       f"- {entero(REG_NULOS)} registros con `DIAS_MORA` nulo quedan fuera de la mora (el pipeline convierte 999 en nulo).",
       "- `hogares_sisben_2009_2020` suma `Sin Hacinamiento` y `Con Hacinamiento` de todos los años de la base Sisbén; `pct_hacinamiento_sisben_2009_2020` es 100 × `Con Hacinamiento` / ese total.",
       f"- El 2020 por sí solo trae entre {texto_min_2020} y {entero(max_2020)} registros por territorio, insuficiente para un porcentaje estable; por eso se acumulan 2009-2020. La unidad del archivo no está declarada y un hogar puede repetirse entre años.",
       "- La cobertura compara clientes actuales con población proyectada a 2020.",
       f"- Oficinas por 100.000 habitantes: corte {ULTIMO_CORTE} sobre población 2020.",
       f"- Confidencialidad: todo conteo menor que {MIN_CONTEO} (incluido 0) pasa a NULL con `dato_suprimido=true`; cada cobertura o porcentaje se anula si se suprime el conteo del que depende. "
       f"Territorios afectados ({len(afectados)}): {'; '.join(f'{n} ({c})' for n, c in afectados) if afectados else 'ninguno'}.",
       "- Los totales del informe permiten deducir la suma de los territorios suprimidos. En clientes y círculos esa suma es 0: ningún registro quedó asignado a esos territorios, lo que no prueba ausencia real.",
       "- Control del guion: el pipeline parte `COMUNA_BARRIO` por `-`, así que un nombre con guion puede quedar con un fragmento como municipio. "
       f"Municipios que coinciden con esos fragmentos (10 o más clientes): {', '.join(f'{m} ({entero(c)})' for m, c in guion) if guion else 'ninguno'}.", ""]

# Comprobaciones
amb, sm = cobertura["ambiguo"][1], cobertura["sin_mapeo"][1]
suma_territorios = one("SELECT sum(clientes_jfk_con_supuestos)::BIGINT FROM base")[0]
suma_total = suma_territorios + amb + sm + SIN_INFO
suma_poblacion = one("SELECT sum(poblacion_2020)::BIGINT FROM base")[0]
suma_o, suma_e = one("SELECT sum(observados)::BIGINT, sum(esperados) FROM mora")
comprobaciones = [
    (f"Clientes: {entero(suma_territorios)} en territorios + {entero(amb)} ambiguo + {entero(sm)} sin_mapeo + {entero(SIN_INFO)} sin_informacion = {entero(suma_total)} (esperado {entero(TOTAL_CLIENTES_MEDELLIN)})", suma_total == TOTAL_CLIENTES_MEDELLIN),
    (f"Población: suma de los 21 = {entero(suma_poblacion)}; Total Medellín = {entero(TOTAL_POBLACION)}", suma_poblacion == TOTAL_POBLACION),
    (f"Estandarización: observados {entero(suma_o)} y esperados {decimal(suma_e)} coinciden", abs(suma_o - suma_e) < 0.01),
    (f"Último corte de datos.gov.co: {ULTIMO_CORTE} (esperado {ULTIMO_CORTE_ESPERADO})", ULTIMO_CORTE == ULTIMO_CORTE_ESPERADO),
]

# Ningun ID en las salidas: nombres de columna, valores de texto y palabras del informe.
archivos = sorted(os.path.join(raiz, f).replace("\\", "/") for raiz, _, nombres in os.walk(SALIDA) for f in nombres if f.endswith(".parquet"))
con.execute(f"""CREATE TEMP TABLE ids AS SELECT CAST(ID_ASOCIADO AS VARCHAR) AS v FROM read_parquet('{CLIENTES}')
UNION SELECT CAST(ID_ASOCIADO AS VARCHAR) FROM read_parquet('{CREDITOS}')
UNION SELECT CAST(ID_CREDITO AS VARCHAR) FROM read_parquet('{CREDITOS}')""")
con.execute("CREATE TEMP TABLE textos (v VARCHAR)")
columnas_id = 0
for ruta in archivos:
    for nombre, tipo, *_ in rows(f"DESCRIBE SELECT * FROM read_parquet('{ruta}')"):
        columnas_id += nombre.upper() in ("ID_ASOCIADO", "ID_CREDITO")
        if tipo == "VARCHAR":
            con.execute(f"INSERT INTO textos SELECT DISTINCT {q(nombre)} FROM read_parquet('{ruta}')")
palabras = sorted(set(re.findall(r"[A-Za-z0-9_\-]{6,}", "\n".join(md))))
con.executemany("INSERT INTO textos VALUES (?)", [(p,) for p in palabras])
valores_id = one("SELECT count(*) FROM (SELECT DISTINCT v FROM textos) WHERE v IN (SELECT v FROM ids)")[0]
comprobaciones.append((f"Ningún ID en las salidas: {columnas_id} columnas de ID y {valores_id} valores de ID en {len(archivos)} archivos parquet y el informe", columnas_id == 0 and valores_id == 0))

# Checksum: solo los parquet, porque el informe registra el resultado de esta misma comparacion.
lineas_checksum = []
for ruta in archivos:
    with open(ruta, "rb") as archivo:
        lineas_checksum.append(f"{hashlib.sha256(archivo.read()).hexdigest()}  {os.path.relpath(ruta, SALIDA).replace(chr(92), '/')}")
ruta_checksum = f"{SALIDA}/checksums.txt"
anterior = None
if os.path.exists(ruta_checksum):
    with open(ruta_checksum, encoding="utf-8") as archivo:
        anterior = archivo.read().splitlines()
with open(ruta_checksum, "w", encoding="utf-8", newline="\n") as archivo:
    archivo.write("\n".join(lineas_checksum) + "\n")
huella = hashlib.sha256("\n".join(lineas_checksum).encode("utf-8")).hexdigest()
if anterior is None:
    comprobaciones.append((f"Checksum: primera corrida, sin corrida previa con la cual comparar ({huella})", True))
else:
    comprobaciones.append((f"Checksum idéntico a la corrida anterior ({huella})", anterior == lineas_checksum))

md += ["## 7. Comprobaciones", ""]
md += tabla(["Comprobación", "Resultado"], [(texto, "OK" if ok else "FALLA") for texto, ok in comprobaciones])
with open(f"{SALIDA}/calidad_integracion.md", "w", encoding="utf-8", newline="\n") as archivo:
    archivo.write("\n".join(md))

# ---------------------------------------------------------------------------
# Resumen en pantalla
# ---------------------------------------------------------------------------
print("[PRELIMINAR] Territorios ordenados por cobertura (clientes JFK por 1.000 habitantes, sin supuestos)")
print("pos | territorio | cobertura_x1000 | razon_oe | muestra_baja | cambia con el supuesto")
for nombre, pos_sin, cob, pos_con, _, razon, baja in ranking:
    print(f"{'--' if pos_sin is None or cob is None else pos_sin} | {nombre} | {decimal(cob)} | {decimal(razon, 4)} | {'si' if baja else 'no'} | {f'si ({pos_sin} -> {pos_con})' if pos_sin != pos_con else 'no'}")
print("\nComprobaciones:")
for texto, ok in comprobaciones:
    print(f"[{'OK' if ok else 'FALLA'}] {texto}")
print(f"\nSalidas en {SALIDA}/")
for linea in lineas_checksum:
    print(linea)
print("\nDatos suprimidos por confidencialidad (territorio: columnas):")
for nombre, columnas in afectados:
    print(f"{nombre}: {columnas}")
consulta = con.execute(f"SELECT * EXCLUDE (advertencia) FROM read_parquet('{SALIDA}/base_integrada_comuna.parquet') ORDER BY comuna")
print("\nBase completa, sin la columna advertencia:")
print(" | ".join(d[0] for d in consulta.description))
for fila in consulta.fetchall():
    print(" | ".join("--" if c is None else str(c) for c in fila))
con.close()
sys.exit(0 if all(ok for _, ok in comprobaciones) else 1)
