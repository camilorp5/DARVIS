# Perfil de fuentes — Integración de datos DARVIS

- **Fecha del perfil:** 2026-11-08.
- **Alcance:** perfil de 4 CSV en `integracion_datos/fuentes/` y cruce por nombre de barrio con `backend/data/processed/clientes.parquet` (solo lectura).
- **Entorno:** `integracion_datos/.venv` con Python 3.11.3 y DuckDB 2.0.0. Las consultas corrieron en memoria y están en el anexo.
- **Confidencialidad:** este documento solo contiene agregados, sin valores de `ID_ASOCIADO` ni `ID_CREDITO`. En las listas de barrios se ocultan los nombres con menos de 10 clientes.
- **Marcas:** [HECHO] medido o verificado · [PROPUESTA] sugerencia · [DESCONOCIDO] sin verificar.
- **Formato:** números con punto de miles y coma decimal.

## 1. Resultados principales

| Pregunta | Resultado |
|---|---|
| Clientes de Medellín que cruzan por nombre exacto con un barrio de hacinamiento | **288.879 de 421.049 = 68,61 %** [HECHO] |
| Lo mismo, excluyendo `SIN_INFORMACION` | **76,90 %** [HECHO] |
| Clientes que cruzan con un nombre que también es comuna (ambiguo) | 108.447, es decir 37,54 % de los que cruzan [HECHO] |
| Cruce sin esos nombres ambiguos | A lo sumo 180.432 = 42,85 % del total, o 48,03 % sin `SIN_INFORMACION` [HECHO, derivado; ver sección 4] |
| ¿`ID_ASOCIADO` es único en `clientes`? | Sí: 876.423 filas y 876.423 distintos [HECHO] |
| Comunas y corregimientos en proyecciones | 16 y 5, una vez excluidas las filas de suma [HECHO] |
| Último corte de Medellín en datos.gov.co | 2026-06-30 [HECHO] |

**Lectura:** el 68,61 % no equivale a clientes ubicados con certeza en un barrio. Parte de `BARRIO_COMUNA` usa nombres de comuna que también existen como barrio en hacinamiento.

[PROPUESTA] Usar la comuna como nivel principal de integración.

## 2. Reglas de diseño para la integración

### Regla 1 — Proyecciones

- Usar solo la fila `grupo_edad = 'Total'` de cada territorio.
- Excluir `Suma Comunas`, `Suma Corregimientos` y `Total Medellín`.
- Mapear estos nombres:

| Hacinamiento (`Comuna`) | Proyecciones (`codigo`) |
|---|---|
| `Poblado` | `El Poblado` |
| `Laureles-Estadio` | `Laureles - Estadio` |
| `San Antonio de Prado` | `San Antonio` |

[HECHO] Estas tres son las únicas diferencias entre los 21 territorios de ambas fuentes, una vez normalizados los nombres.

[PROPUESTA] Filtrar con `trim(grupo_edad) = 'Total'`. El conteo de 24 filas `Total`, una por territorio, se midió con `trim`, y hay etiquetas de edad escritas de más de una forma (ver sección 3.3).

### Regla 2 — Círculos solidarios

- Cubre de 2016-01-19 a 2019-06-29: es **contexto histórico, no medida actual**.
- 37,6 % de las filas no tiene barrio.
- La columna `monto_solictado` tiene un error de tipeo en el nombre y es de tipo texto.

### Regla 3 — datos.gov.co

- Usar Medellín con último corte 2026-06-30.
- Excluir las filas `TOTAL…`.
- Convertir a número los valores en texto.

[PROPUESTA] Leer las columnas de valores como texto y convertirlas explícitamente: quitar los `.` de miles y cambiar la `,` decimal por `.`. No conviene confiar en la detección automática de tipos: un valor como `1.234` significa mil doscientos treinta y cuatro, pero se leería como 1,234 si la columna se detecta como decimal. `Número de cuentas centralizadas` se detectó como `DOUBLE`.

### Regla 4 — Hacinamiento

Dos barrios aparecen en más de una comuna: **a resolver**. [DESCONOCIDO] Este perfil midió cuántos son, pero no cuáles.

## 3. Perfil por fuente

"Marcadores" cuenta valores que equivalen a un vacío, una vez normalizados: `NO DATO`, `SIN IDENTIFICAR`, `SIN INFORMACION`, `SIN_INFORMACION`, `NAN`, `NULL`, `N/A`, `NA`, `ND`. Los tipos son los que detectó DuckDB. Los 4 archivos están en UTF-8.

### 3.1 Hacinamiento — `hacinamiento_barrio_sisben3.csv`

**3.384 filas · años 2009 a 2020 · 282 filas por año**

| Columna | Tipo | Nulos | % nulos | Marcadores |
|---|---|---:|---:|---:|
| Comuna | VARCHAR | 0 | 0,00 % | 12 |
| Codigo_comuna | BIGINT | 0 | 0,00 % | 0 |
| Barrio | VARCHAR | 0 | 0,00 % | 228 |
| Codigo_barrio | BIGINT | 0 | 0,00 % | 0 |
| Sin Hacinamiento | BIGINT | 0 | 0,00 % | 0 |
| Con Hacinamiento | BIGINT | 0 | 0,00 % | 0 |
| Año | BIGINT | 0 | 0,00 % | 0 |

- **Barrios distintos, sin marcadores:** 261, tanto crudos como normalizados.
- **10 ejemplos:** Alejandro Echavarría, Betania, Castropol, El Pesebre, Gerona, La Gloria, Las Mercedes, Miraflores, Robledo, Santa Teresita.
- **Barrios normalizados en más de una comuna:** 2.
- **Territorios, con su `Codigo_comuna`:** 0 Sin identificar · 1 Popular · 2 Santa Cruz · 3 Manrique · 4 Aranjuez · 5 Castilla · 6 Doce de Octubre · 7 Robledo · 8 Villa Hermosa · 9 Buenos Aires · 10 La Candelaria · 11 Laureles-Estadio · 12 La América · 13 San Javier · 14 Poblado · 15 Guayabal · 16 Belén · 50 Palmitas · 60 San Cristóbal · 70 Altavista · 80 San Antonio de Prado · 90 Santa Elena.

### 3.2 Círculos solidarios — `creditos_otorgados_mediante_circulos_solidarios.csv`

**91.777 filas · 2016-01-19 a 2019-06-29 · 0 fechas sin interpretar**

| Columna | Tipo | Nulos | % nulos | Marcadores |
|---|---|---:|---:|---:|
| sexo | VARCHAR | 0 | 0,00 % | 16.469 |
| edad | BIGINT | 18.592 | 20,26 % | 0 |
| tipo_de_emprendimiento | VARCHAR | 0 | 0,00 % | 10.990 |
| idea_de_negocio | VARCHAR | 0 | 0,00 % | 10.990 |
| estrato | BIGINT | 97 | 0,11 % | 0 |
| barrio | VARCHAR | 34.489 | 37,58 % | 0 |
| fecha_colocacion | DATE | 0 | 0,00 % | 0 |
| monto_solictado | VARCHAR | 0 | 0,00 % | 0 |

- **Filas por año:** 2016: 16.469 · 2017: 30.244 · 2018: 30.303 · 2019: 14.761.
- **Barrios distintos, sin marcadores:** 269, tanto crudos como normalizados.
- **10 ejemplos:** 8 de marzo, bombona n.1, comuna 02 santa cruz, el bosque, fuente clara, la gabriela, las margaritas, miranda, puerto nuevo, santa rita.
- **Mezcla de niveles:** [HECHO] el campo `barrio` incluye valores de comuna, como `comuna 02 santa cruz`.

### 3.3 Proyecciones — `proyecciones_de_poblacion_medellin_2020.csv`

**432 filas · solo 2020 (el año aparece únicamente en los nombres de columna)**

| Columna | Tipo | Nulos | % nulos | Marcadores |
|---|---|---:|---:|---:|
| codigoDane_municipio | BIGINT | 0 | 0,00 % | 0 |
| tipo_division_geografica | VARCHAR | 0 | 0,00 % | 0 |
| codigo | VARCHAR | 0 | 0,00 % | 0 |
| grupo_edad | VARCHAR | 0 | 0,00 % | 0 |
| total_2020 | BIGINT | 0 | 0,00 % | 0 |
| hombres_2020 | BIGINT | 0 | 0,00 % | 0 |
| mujeres_2020 | BIGINT | 0 | 0,00 % | 0 |

- **Columna de comuna:** no hay ninguna con "comuna" en el nombre. El nombre del territorio está en `codigo`, y el tipo en `tipo_division_geografica`. No trae código numérico de comuna.

| `tipo_division_geografica` | Filas | Valores de `codigo` | Territorios reales |
|---|---:|---:|---:|
| Comuna | 306 | 17 (incluye `Suma Comunas`) | **16** |
| Corregimiento | 108 | 6 (incluye `Suma Corregimientos`) | **5** |
| Total Medellín | 18 | 1 | — |

- **Comunas:** Aranjuez, Belén, Buenos Aires, Castilla, Doce de Octubre, El Poblado, Guayabal, La América, La Candelaria, Laureles - Estadio, Manrique, Popular, Robledo, San Javier, Santa Cruz, Villa Hermosa.
- **Corregimientos:** Altavista, Palmitas, San Antonio, San Cristóbal, Santa Elena.
- **Grupos de edad:** 19 etiquetas distintas, con 18 filas por territorio y 24 filas `Total`. [DESCONOCIDO] Qué etiqueta está escrita de más de una forma.

### 3.4 datos.gov.co — `Saldo_de_las_captaciones_y_colocaciones_por_municipios_20261108.csv`

**323.467 filas · 80 columnas · 2006-03-31 a 2026-06-30 · 82 cortes · 0 fechas sin interpretar**

| Medellín | Valor |
|---|---|
| Nombre en el archivo | `MEDELLIN` |
| Código de departamento / municipio | 1 / 1 (no son códigos DANE) |
| Filas | 3.420 |
| Rango | 2006-03-31 a **2026-06-30**, 82 cortes |
| Filas en el último corte | 40, de 5 tipos de entidad |

- **Filas agregadas:** 58.339 filas con nombre `TOTAL…`, como `TOTAL ANTIOQUIA`.
- **Nivel geográfico:** municipio. No trae comuna ni barrio.
- **Nulos y marcadores:** las 80 columnas tienen 0 nulos y 0 marcadores.

| # | Columna | Tipo |
|---:|---|---|
| 1 | Tipo de entidad | BIGINT |
| 2 | Código de entidad | BIGINT |
| 3 | Código del departamento | BIGINT |
| 4 | Código del municipio | BIGINT |
| 5 | Nombre del municipio | VARCHAR |
| 6 | Fecha de Corte | DATE |
| 7 | Depósitos en cuenta corriente bancaria | VARCHAR |
| 8 | Depósitos simples | VARCHAR |
| 9 | Certificados de depósito a término | VARCHAR |
| 10 | Depósitos de ahorro | VARCHAR |
| 11 | Cuenta de ahorros de valor real | BIGINT |
| 12 | Cuentas de ahorro especial | VARCHAR |
| 13 | Certificado de ahorro valor real | VARCHAR |
| 14 | Documentos por pagar | VARCHAR |
| 15 | Cuenta centralizada | VARCHAR |
| 16 | Títulos de inversión en circulación | VARCHAR |
| 17 | Cartera de créditos | VARCHAR |
| 18 | Créditos de vivienda | VARCHAR |
| 19 | Categoría A riesgo normal | VARCHAR |
| 20 | Categoría B riesgo aceptable | VARCHAR |
| 21 | Categoría C riesgo apreciable | VARCHAR |
| 22 | Categoría D riesgo significativo | VARCHAR |
| 23 | Categoría E riesgo de Incobrabilidad | VARCHAR |
| 24 | Categoría A riesgo normal, garantía idónea, créditos y leasing de consumo | VARCHAR |
| 25 | Categoría B riesgo aceptable, garantía idónea, créditos y leasing de consumo | VARCHAR |
| 26 | Categoría C riesgo apreciable, garantía idónea, créditos y leasing de consumo | VARCHAR |
| 27 | Categoría D riesgo significativo, garantía idónea, créditos y leasing de consumo | VARCHAR |
| 28 | Categoría E riesgo de incobrabilidad, garantía idónea, créditos y leasing de consumo | VARCHAR |
| 29 | Categoría A riesgo normal, otras garantías, créditos y leasing de consumo | VARCHAR |
| 30 | Categoría B riesgo aceptable, otras garantías, créditos y leasing de consumo | VARCHAR |
| 31 | Categoría C riesgo apreciable, otras garantías, créditos y leasing de consumo | VARCHAR |
| 32 | Categoría D riesgo significativo, otras garantías, créditos y leasing de consumo | VARCHAR |
| 33 | Categoría E riesgo de incobrabilidad, otras garantías, créditos y leasing de consumo | VARCHAR |
| 34 | Microcréditos, garantía idónea | VARCHAR |
| 35 | Categoría A riesgo normal C29 | VARCHAR |
| 36 | Categoría B riesgo aceptable C30 | VARCHAR |
| 37 | Categoría C riesgo apreciable C31 | VARCHAR |
| 38 | Categoría D riesgo significativo C32 | VARCHAR |
| 39 | Categoría E riesgo de Incobrabilidad C33 | VARCHAR |
| 40 | Categoría A riesgo normal bienes dados en leasing C34 | VARCHAR |
| 41 | Categoría B riesgo aceptable bienes dados en leasing | VARCHAR |
| 42 | Categoría C riesgo apreciable bienes dados en leasing | VARCHAR |
| 43 | Categoría D riesgo significativo bienes dados en leasing | VARCHAR |
| 44 | Categoría E riesgo de Incobrabilidad bienes dados en leasing | VARCHAR |
| 45 | Microcréditos, otras garantías | VARCHAR |
| 46 | Categoría A riesgo normal C40 | VARCHAR |
| 47 | Categoría B riesgo aceptable C41 | VARCHAR |
| 48 | Categoría C riesgo apreciable C42 | VARCHAR |
| 49 | Categoría D riesgo significativo C43 | VARCHAR |
| 50 | Categoría E riesgo de Incobrabilidad C44 | VARCHAR |
| 51 | Categoría A riesgo normal bienes dados en leasing C45 | VARCHAR |
| 52 | Categoría B riesgo aceptable bienes dados en leasin C46 | VARCHAR |
| 53 | Categoría C riesgo apreciable bienes dados en leasing C47 | VARCHAR |
| 54 | Categoría D riesgo significativo bienes dados en leasing C48 | VARCHAR |
| 55 | Categoría E riesgo de Incobrabilidad bienes dados en leasing C49 | VARCHAR |
| 56 | Categoría A riesgo normal, garantía idónea, créditos y leasing comerciales | VARCHAR |
| 57 | Categoría B riesgo aceptable, garantía idónea, créditos y leasing comerciales | VARCHAR |
| 58 | Categoría C riesgo apreciable, garantía idónea, créditos y leasing comerciales | VARCHAR |
| 59 | Categoría D riesgo significativo, garantía idónea, créditos y leasing comerciales | VARCHAR |
| 60 | Categoría E riesgo de incobrabilidad, garantía idónea, créditos y leasing comerciales | VARCHAR |
| 61 | Categoría A riesgo normal, otras garantías, créditos y leasing comerciales | VARCHAR |
| 62 | Categoría B riesgo aceptable, otras garantías, créditos y leasing comerciales | VARCHAR |
| 63 | Categoría C riesgo apreciable, otras garantías, créditos y leasing comerciales | VARCHAR |
| 64 | Categoría D riesgo significativo, otras garantías, créditos y leasing comerciales | VARCHAR |
| 65 | Categoría E riesgo de incobrabilidad, otras garantías, créditos y leasing comerciales | VARCHAR |
| 66 | Provisión créditos de vivienda | VARCHAR |
| 67 | Provisión créditos y operaciones de leasing de consumo | VARCHAR |
| 68 | Provisión microcréditos | VARCHAR |
| 69 | Provisión créditos y operaciones de leasing comerciales | VARCHAR |
| 70 | Provisión general | VARCHAR |
| 71 | Número de CDT | VARCHAR |
| 72 | Número de cuentas centralizadas | DOUBLE |
| 73 | Número de oficinas | BIGINT |
| 74 | Número de empleados contratados | VARCHAR |
| 75 | Número de empleados subcontratados | VARCHAR |
| 76 | Componente contracíclico provisión individual | VARCHAR |
| 77 | Derechos de transferencia de cartera de créditos por operaciones de apoyos transitorios de liquidez | VARCHAR |
| 78 | Préstamos a empleados | VARCHAR |
| 79 | Deterioro (provisión) préstamos a empleados | VARCHAR |
| 80 | Crédito de consumo de bajo monto | VARCHAR |

## 4. Cruce de clientes JFK con barrios de hacinamiento

**Método:** se toman los clientes con `MUNICIPIO_DEPTO` = Medellín. `BARRIO_COMUNA` y `Barrio` se normalizan con mayúsculas, sin tildes y sin espacios dobles, y se comparan por nombre exacto. No se quitan sufijos como `No. 1`. Los clientes se cuentan como `ID_ASOCIADO` distintos.

| Medida | Clientes | % |
|---|---:|---:|
| Clientes de Medellín | 421.049 | 100,00 % |
| `SIN_INFORMACION` | 45.411 | 10,79 % |
| Cruzan por nombre exacto | 288.879 | 68,61 % |
| Con barrio informado que no cruzan | 86.759 | 20,61 % (derivado) |

- **Sobre clientes con barrio informado (375.638):** cruza el 76,90 %.
- **Una fila por cliente:** [HECHO] las 421.049 filas son 421.049 clientes distintos, y ninguno tiene más de un barrio.
- **Valores de barrio, sin `SIN_INFORMACION`:** 394 en total, 208 cruzan y 186 no.

### Nombres ambiguos

Estos nombres cruzan con un barrio de hacinamiento y también son el nombre de una comuna. [DESCONOCIDO] Si el dato de JFK se refiere al barrio o a toda la comuna.

| Nombre | Clientes |
|---|---:|
| ROBLEDO | 25.751 |
| BELEN | 18.707 |
| BUENOS AIRES | 13.168 |
| CASTILLA | 11.863 |
| ARANJUEZ | 10.469 |
| GUAYABAL | 8.087 |
| SANTA CRUZ | 5.291 |
| POPULAR | 5.057 |
| VILLA HERMOSA | 4.963 |
| LA AMERICA | 4.679 |
| LA CANDELARIA | 412 |
| **Total** | **108.447** |

Es un mínimo, porque la comparación con comunas también es exacta: `EL POBLADO` no cuenta como ambigua, ya que hacinamiento llama `Poblado` a esa comuna. Por eso el 42,85 % de la sección 1 es un máximo. Se calcula como 288.879 − 108.447 = 180.432.

### 20 barrios no cruzados con más clientes

| Barrio normalizado | Clientes | % de Medellín | Coincide con comuna |
|---|---:|---:|---|
| MANRIQUE | 12.666 | 3,01 % | sí |
| SAN ANTONIO DE PRADO | 10.836 | 2,57 % | sí |
| MANRIQUE CENTRAL NO. 1 | 4.695 | 1,12 % | no |
| SAN CRISTOBAL | 4.078 | 0,97 % | sí |
| CAICEDO LA TOMA | 3.435 | 0,82 % | no |
| CENTRO | 3.231 | 0,77 % | no |
| BELEN RINCON | 3.165 | 0,75 % | no |
| CAMPOAMOR | 3.009 | 0,71 % | no |
| BELEN SAN BERNARDO | 1.876 | 0,45 % | no |
| RODEO ALTO | 1.673 | 0,40 % | no |
| SANTA ELENA | 1.596 | 0,38 % | sí |
| LOMA DE LOS BERNAL | 1.518 | 0,36 % | no |
| BELEN LA MOTA | 1.505 | 0,36 % | no |
| EL RODEO | 1.464 | 0,35 % | no |
| BELEN ALTAVISTA | 1.443 | 0,34 % | no |
| PLAYON DE LOS COMUNEROS | 1.443 | 0,34 % | no |
| BARICHARA | 1.263 | 0,30 % | no |
| BELEN LAS VIOLETAS | 1.161 | 0,28 % | no |
| ROBLEDO MIRAMAR | 1.135 | 0,27 % | no |
| ROBLEDO KENNEDY | 1.004 | 0,24 % | no |

`SIN_INFORMACION` no aparece en esta lista porque se reporta aparte.

**Observaciones:**
- [HECHO] Los cuatro nombres con "sí" suman 29.176 clientes. Coinciden con una comuna o corregimiento, aunque no con un barrio.
- [HECHO] Varios nombres combinan una comuna con otro término, como `BELEN RINCON` o `ROBLEDO KENNEDY`.
- [DESCONOCIDO] Si esos nombres combinados corresponden a un barrio oficial. Hay que verificarlo al construir la tabla puente.

## 5. Pendientes

1. [DESCONOCIDO] Nombres de los 2 barrios de hacinamiento que aparecen en más de una comuna (Regla 4).
2. [DESCONOCIDO] Etiqueta de `grupo_edad` escrita de más de una forma en proyecciones.
3. [DESCONOCIDO] A qué nivel corresponden los nombres ambiguos de `BARRIO_COMUNA` en JFK.
4. [DESCONOCIDO] Ficha de cada fuente: nombre exacto del conjunto, portal, enlace, fecha de consulta y licencia. Este perfil solo trabajó con los archivos locales.

## Anexo — Consultas ejecutadas

Se ejecutan desde la raíz del repo, con `integracion_datos/.venv/Scripts/python.exe`. Los valores de ID nunca se imprimen.

### Perfil de los 4 CSV

```python
import re, sys, duckdb
sys.stdout.reconfigure(encoding="utf-8")
D = "integracion_datos/fuentes/"
FILES = [("hacinamiento", "hacinamiento_barrio_sisben3.csv"),
         ("circulos", "creditos_otorgados_mediante_circulos_solidarios.csv"),
         ("proyecciones", "proyecciones_de_poblacion_medellin_2020.csv"),
         ("datosgov", "Saldo_de_las_captaciones_y_colocaciones_por_municipios_20261108.csv")]
con = duckdb.connect()  # en memoria: no escribe archivos
rows = lambda s: con.execute(s).fetchall()
one = lambda s: con.execute(s).fetchone()
q = lambda c: '"' + c.replace('"', '""') + '"'
norm = lambda x: rf"strip_accents(upper(trim(regexp_replace(CAST({x} AS VARCHAR), '\s+', ' ', 'g'))))"
PH = "('NO DATO','SIN IDENTIFICAR','SIN INFORMACION','SIN_INFORMACION','NAN','NULL','N/A','NA','ND')"
EXCL = "('NO DATO','SIN IDENTIFICAR')"

def as_date(t, c):
    typ = {r[0]: r[1] for r in rows(f"DESCRIBE {t}")}[c]
    if typ in ("DATE", "TIMESTAMP"):
        return f"{q(c)}::DATE"
    return f"try_strptime(trim(CAST({q(c)} AS VARCHAR)), '%d/%m/%Y')::DATE"

def barrios(t, c):
    n = norm(q(c))
    a, b = one(f"SELECT count(DISTINCT {q(c)}), count(DISTINCT {n}) FROM {t} WHERE {n} NOT IN {EXCL}")
    nom = [r[0] for r in rows(f"SELECT DISTINCT {q(c)} FROM {t} WHERE {n} NOT IN {EXCL} ORDER BY 1")]
    print(f"barrios distintos (sin marcadores): crudos={a}, normalizados={b}")
    print("10 ejemplos:", nom[::max(len(nom) // 10, 1)][:10])

for t, f in FILES:
    try:
        open(D + f, "rb").read().decode("utf-8"); enc = "utf-8"
    except UnicodeDecodeError:
        enc = "latin-1"
    con.execute(f"CREATE TEMP TABLE {t} AS SELECT * FROM read_csv('{D + f}', header=true, delim=',', sample_size=-1, encoding='{enc}')")
    n = one(f"SELECT count(*) FROM {t}")[0]
    print(f"\n===== {t} | {f} | encoding={enc} | filas={n}")
    for name, typ, *_ in rows(f"DESCRIBE {t}"):
        nu, ph = one(f"SELECT count(*) FILTER ({q(name)} IS NULL), count(*) FILTER ({norm(q(name))} IN {PH}) FROM {t}")
        print(f"{name} | {typ} | nulos={nu} ({nu/n:.2%}) | marcadores={ph}")

print("\n--- hacinamiento")
y = "Año"
print("filas por ano:", rows(f"SELECT {q(y)}, count(*) FROM hacinamiento GROUP BY 1 ORDER BY 1"))
barrios("hacinamiento", "Barrio")
print("comunas:", rows("SELECT DISTINCT Codigo_comuna, Comuna FROM hacinamiento ORDER BY 1, 2"))
print("barrios normalizados en mas de una comuna:", one(f"SELECT count(*) FROM (SELECT {norm('Barrio')} b FROM hacinamiento WHERE {norm('Barrio')} NOT IN {EXCL} GROUP BY 1 HAVING count(DISTINCT Codigo_comuna) > 1)")[0])

print("\n--- circulos")
d = as_date("circulos", "fecha_colocacion")
print("min, max, no_parseadas:", one(f"SELECT min({d}), max({d}), count(*) FILTER ({d} IS NULL AND fecha_colocacion IS NOT NULL) FROM circulos"))
print("filas por ano:", rows(f"SELECT year({d}), count(*) FROM circulos GROUP BY 1 ORDER BY 1"))
barrios("circulos", "barrio")

print("\n--- proyecciones")
cols = [r[0] for r in rows("DESCRIBE proyecciones")]
print("columnas con 'comuna' en el nombre:", [c for c in cols if "comuna" in c.lower()])
print("anos en nombres de columna:", sorted({m for c in cols for m in re.findall(r"(?:19|20)\d\d", c)}))
for tipo, filas, k, vals in rows("SELECT tipo_division_geografica, count(*), count(DISTINCT codigo), list_sort(list(DISTINCT codigo)) FROM proyecciones GROUP BY 1 ORDER BY 1"):
    print(f"{tipo} | filas={filas} | valores distintos de codigo={k} | {vals}")
c16, c5 = one("SELECT count(DISTINCT codigo) FILTER (lower(tipo_division_geografica) LIKE '%comuna%'), count(DISTINCT codigo) FILTER (lower(tipo_division_geografica) LIKE '%corregimiento%') FROM proyecciones")
print(f"comunas={c16} (esperado 16) | corregimientos={c5} (esperado 5)")
print("grupos de edad distintos, filas Total:", one("SELECT count(DISTINCT grupo_edad), count(*) FILTER (trim(grupo_edad) = 'Total') FROM proyecciones"))

print("\n--- datosgov")
nom, dep, mun, cut = "Nombre del municipio", "Código del departamento", "Código del municipio", "Fecha de Corte"
d = as_date("datosgov", cut)
print("global min, max, cortes, no_parseadas:", one(f"SELECT min({d}), max({d}), count(DISTINCT {d}), count(*) FILTER ({d} IS NULL AND {q(cut)} IS NOT NULL) FROM datosgov"))
med = f"{norm(q(nom))} LIKE '%MEDELLIN%'"
print("Medellin (nombre, depto, municipio, filas, min, max, cortes):")
for r in rows(f"SELECT {q(nom)}, {q(dep)}, {q(mun)}, count(*), min({d}), max({d}), count(DISTINCT {d}) FROM datosgov WHERE {med} GROUP BY 1, 2, 3 ORDER BY 4 DESC"):
    print(" ", r)
print("filas Medellin en su ultimo corte, tipos de entidad:", one(f"SELECT count(*), count(DISTINCT {q('Tipo de entidad')}) FROM datosgov WHERE {med} AND {d} = (SELECT max({d}) FROM datosgov WHERE {med})"))
print("filas TOTAL agregadas:", one(f"SELECT count(*) FROM datosgov WHERE {norm(q(nom))} LIKE 'TOTAL%'")[0])
```

### Cruce con `clientes.parquet`

```python
import sys, duckdb
sys.stdout.reconfigure(encoding="utf-8")
con = duckdb.connect()  # en memoria: no escribe archivos
one = lambda s: con.execute(s).fetchone()
rows = lambda s: con.execute(s).fetchall()
norm = lambda x: rf"strip_accents(upper(trim(regexp_replace(CAST({x} AS VARCHAR), '\s+', ' ', 'g'))))"
P = "backend/data/processed/clientes.parquet"
H = "integracion_datos/fuentes/hacinamiento_barrio_sisben3.csv"

con.execute(f"CREATE TEMP TABLE hac AS SELECT DISTINCT {norm('Barrio')} AS b FROM read_csv('{H}', header=true, delim=',', sample_size=-1) WHERE {norm('Barrio')} <> 'SIN IDENTIFICAR'")
con.execute(f"CREATE TEMP TABLE com AS SELECT DISTINCT {norm('Comuna')} AS c FROM read_csv('{H}', header=true, delim=',', sample_size=-1) WHERE {norm('Comuna')} <> 'SIN IDENTIFICAR'")
print("barrios y comunas de referencia:", one("SELECT (SELECT count(*) FROM hac), (SELECT count(*) FROM com)"))

print("clientes.parquet filas, ID distintos:", one(f"SELECT count(*), count(DISTINCT ID_ASOCIADO) FROM read_parquet('{P}')"))
print("variantes con MEDELLIN (texto normalizado, filas):", rows(f"SELECT {norm('MUNICIPIO_DEPTO')}, count(*) FROM read_parquet('{P}') WHERE {norm('MUNICIPIO_DEPTO')} LIKE '%MEDELLIN%' GROUP BY 1 ORDER BY 2 DESC"))

con.execute(f"""CREATE TEMP TABLE m2 AS
SELECT m.id, m.b, h.b IS NOT NULL AS cruza, c.c IS NOT NULL AS es_comuna, m.b = 'SIN_INFORMACION' AS sin_info
FROM (SELECT ID_ASOCIADO AS id, coalesce({norm('BARRIO_COMUNA')}, 'SIN_INFORMACION') AS b
      FROM read_parquet('{P}') WHERE {norm('MUNICIPIO_DEPTO')} = 'MEDELLIN') m
LEFT JOIN hac h ON m.b = h.b
LEFT JOIN com c ON m.b = c.c""")
con.execute("""CREATE TEMP TABLE pc AS
SELECT id, bool_or(cruza) AS cruza, bool_and(sin_info) AS sin_info, bool_or(cruza AND es_comuna) AS ambiguo, count(DISTINCT b) AS nb
FROM m2 GROUP BY 1""")

N, SI, C, A, MB, FIL = one("SELECT count(*), count(*) FILTER (sin_info), count(*) FILTER (cruza), count(*) FILTER (ambiguo), count(*) FILTER (nb > 1), (SELECT count(*) FROM m2) FROM pc")
print(f"\nMedellin: filas={FIL}, clientes distintos={N}, clientes con mas de un barrio={MB}")
print(f"SIN_INFORMACION: clientes={SI} ({SI/N:.2%})")
print(f"cruzan por nombre exacto: clientes={C}")
print(f"% sobre todos los clientes de Medellin: {C/N:.2%}")
print(f"% excluyendo SIN_INFORMACION: {C/(N-SI):.2%}")
print(f"con barrio informado que no cruzan: clientes={N-SI-C}")
print(f"cruzan con un nombre que tambien es comuna: clientes={A} ({A/max(C,1):.2%} de los que cruzan)")
print("valores de barrio sin SIN_INFORMACION (total, cruzan, no cruzan):", one("SELECT count(DISTINCT b), count(DISTINCT b) FILTER (cruza), count(DISTINCT b) FILTER (NOT cruza) FROM m2 WHERE NOT sin_info"))

print("\n20 barrios NO cruzados con mas clientes (barrio | clientes | % de Medellin | coincide con comuna):")
for b, n, ec in rows("SELECT b, count(DISTINCT id), bool_or(es_comuna) FROM m2 WHERE NOT cruza AND NOT sin_info GROUP BY 1 HAVING count(DISTINCT id) >= 10 ORDER BY 2 DESC, 1 LIMIT 20"):
    print(f"{b} | {n} | {n/N:.2%} | {'si' if ec else 'no'}")

print("\nNombres que cruzan y tambien son comuna (nombre | clientes):")
for b, n in rows("SELECT b, count(DISTINCT id) FROM m2 WHERE cruza AND es_comuna GROUP BY 1 HAVING count(DISTINCT id) >= 10 ORDER BY 2 DESC, 1"):
    print(f"{b} | {n}")
```
