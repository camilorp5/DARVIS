from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import duckdb
import os
import json
import re
from groq import Groq
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware


# 2. Cargar las variables del archivo .env a os.environ
load_dotenv()

app = FastAPI(title="Hackathon ITM - JFK Analytics Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


con = duckdb.connect(database=':memory:')
groq_client: Optional[Groq] = None

def obtener_groq() -> Groq:
    """Crea el cliente al primer uso para que el servidor arranque aunque falte la clave."""
    global groq_client
    if groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="El chat no está disponible: falta configurar GROQ_API_KEY. El caso guía sigue funcionando sin modelo.")
        groq_client = Groq(api_key=api_key)
    return groq_client

# Variable global para almacenar el esquema real extraído de los Parquet
REAL_DB_SCHEMA = ""

# 'agregado' (por defecto): solo tablas agregadas. 'completo': también las tablas de JFK, para uso interno del equipo.
MODO_COMPLETO = os.getenv("DARVIS_MODO", "agregado").strip().lower() == "completo"

# Agregados de integracion_datos/salida. La ruta sale de la ubicación de este archivo, no del directorio de ejecución.
SALIDA_INTEGRACION = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "integracion_datos", "salida")).replace("\\", "/")
TABLAS_INTEGRACION = {
    "base_integrada_comuna": """Descripción de 'base_integrada_comuna' (21 filas, una por comuna o corregimiento de Medellín; solo agregados):
- comuna: clave del territorio; nombre_mostrar: nombre para gráficos; tipo: 'comuna' o 'corregimiento'.
- clientes_jfk: clientes con territorio asignado, sin el supuesto CENTRO; clientes_jfk_con_supuestos: incluye ese supuesto.
- clientes_con_saldos y clientes_con_credito: de los clientes_jfk, los que tienen saldos registrados y los que tienen algún crédito; son conteos ya agregados en esta tabla.
- poblacion_2020: población proyectada a 2020.
- cobertura_x1000: clientes_jfk por 1.000 habitantes; cobertura_x1000_con_supuestos: con el supuesto CENTRO; cobertura_credito_x1000: clientes_con_credito por 1.000 habitantes.
- hogares_sisben_2009_2020: suma de los conteos anuales de la base Sisbén 2009-2020; no es el total de hogares y un hogar puede repetirse entre años. pct_hacinamiento_sisben_2009_2020: porcentaje (0 a 100) con hacinamiento sobre esa misma suma de conteos anuales, con las mismas limitaciones.
- circulos_2016_2019: filas de créditos otorgados mediante círculos solidarios asignadas al territorio.
- mora_observada: proporción (0 a 1) de registros crédito-corte con más de 30 días de mora; mora_esperada: proporción esperada según edad, estrato y código de línea.
- razon_oe: mora observada / esperada; razon_oe_li y razon_oe_ls: intervalo al 95 % agrupado por cliente.
- muestra_baja: menos de 100 clientes con saldos; advertencia: nota sobre el territorio.
- dato_suprimido: true si algún conteo del territorio fue suprimido (puede ser solo circulos_2016_2019); no implica que la cobertura o la mora sean inválidas: revisa si esas columnas son NULL. No filtres con WHERE NOT dato_suprimido.
ADVERTENCIAS OBLIGATORIAS:
- NULL significa suprimido o no medible, nunca cero (única excepción: en circulos_2016_2019 un NULL significa que ningún registro quedó asignado al territorio en esta versión de los datos, lo que no prueba ausencia real). No uses COALESCE(columna, 0) ni presentes NULL como 0 en las demás columnas.
- Los corregimientos no se rankean: en rankings y ordenamientos usa WHERE tipo = 'comuna'.
- La Candelaria depende del supuesto CENTRO: usa cobertura_x1000 por defecto y, si La Candelaria aparece en un resultado de cobertura, indícalo en el título.
- El intervalo razon_oe_li/razon_oe_ls indica si la diferencia es ruido: si contiene 1, no afirmes que el territorio tiene más o menos mora de la esperada.
- La cobertura compara clientes actuales con población proyectada a 2020: preséntala como aproximación.""",
    "contexto_medellin_sfc": """Descripción de 'contexto_medellin_sfc' (una fila: total de Medellín en el último corte de datos.gov.co; no se divide por territorio ni se une con base_integrada_comuna):
- fecha_corte: fecha del corte.
- "Cartera de créditos", "Microcréditos, garantía idónea", "Microcréditos, otras garantías": saldos en la unidad de la fuente.
- "Número de oficinas": oficinas; oficinas_por_100000_hab: oficinas por 100.000 habitantes con población de 2020.
- Esas cuatro columnas tienen espacios o comas: escríbelas siempre entre comillas dobles en el SQL.""",
    "indice_multidimensional_calidad_vida": """Descripción de 'indice_multidimensional_calidad_vida':
- varcharidcomunafk: identificador de comuna (debe coincidir con base_integrada_comuna).
- intaño: año de medición (usar MAX(intaño) para el año más reciente).
- decimcv: índice global multidimensional de calidad de vida.
- decvulnerabilida: índice específico de vulnerabilidad (OJO: se escribe exactamente 'decvulnerabilida', NUNCA 'decv' ni 'decvulnerabilidad').
- decsalud: dimensión de salud.
- dectrabajo: dimensión de trabajo.
- decingresos: dimensión de ingresos.
- decpercepcioncalidadvida: percepción subjetiva de calidad de vida."""
}

@app.on_event("startup")
def setup_database():
    global REAL_DB_SCHEMA
    tables = ["clientes", "creditos", "saldos", "movimientos"] if MODO_COMPLETO else []
    schema_parts = []
    
    print("\n=== 🔍 INSPECCIONANDO TABLAS Y COLUMNAS REALES ===")
    for table in tables + list(TABLAS_INTEGRACION):
        parquet_file = f"data/processed/{table}.parquet" if os.path.exists(f"data/processed/{table}.parquet") else f"{table}.parquet"
        if table in TABLAS_INTEGRACION:
            parquet_file = f"{SALIDA_INTEGRACION}/{table}.parquet"
        if os.path.exists(parquet_file):
            con.execute(f"CREATE TABLE IF NOT EXISTS {table} AS SELECT * FROM '{parquet_file}';")
            # Extraer nombres reales de columnas y tipos de datos
            columns_info = con.execute(f"DESCRIBE {table};").fetchall()
            cols_str = ", ".join([f"{col[0]} ({col[1]})" for col in columns_info])
            schema_parts.append(f"Tabla '{table}': {cols_str}")
            if table in TABLAS_INTEGRACION:
                schema_parts.append(TABLAS_INTEGRACION[table])
            print(f"✅ {table}: [{cols_str}]")
        else:
            print(f"⚠️ No se encontró '{parquet_file}'.")
            
    # Las tablas ya están materializadas con CREATE TABLE AS: desde aquí el SQL no puede leer archivos ni red.
    con.execute("SET enable_external_access=false")
    con.execute("SET lock_configuration=true")

    REAL_DB_SCHEMA = "\n".join(schema_parts)
    print("==================================================\n")

COMANDOS_PROHIBIDOS = re.compile(r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|COPY|EXPORT|PRAGMA|INSTALL|LOAD|CALL|SET)\b", re.IGNORECASE)
COLUMNAS_ID = {"ID_ASOCIADO", "ID_CREDITO", "ID_EVENTO"}
MAX_FILAS = 500

def validar_sql(sql: Any) -> str:
    """Devuelve la consulta lista para ejecutar si es una sola lectura; si no, responde 400."""
    if not isinstance(sql, str):
        raise HTTPException(status_code=400, detail="El modelo no devolvió una consulta SQL en texto.")
    limpio = sql.strip()
    if limpio.endswith(";"):
        limpio = limpio[:-1].rstrip()
    if ";" in limpio:
        raise HTTPException(status_code=400, detail="Solo se permite una sentencia SQL.")
    if not re.match(r"(SELECT|WITH)\b", limpio, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="La consulta debe empezar con SELECT o WITH.")
    prohibido = COMANDOS_PROHIBIDOS.search(limpio)
    if prohibido:
        raise HTTPException(status_code=400, detail=f"La consulta contiene un comando no permitido: {prohibido.group(1).upper()}.")
    return limpio

# Debe coincidir con la consulta de integracion_datos/caso_guia.py.
CASO_GUIA_SQL = """WITH c AS (SELECT nombre_mostrar, cobertura_x1000, razon_oe, razon_oe_li, razon_oe_ls, pct_hacinamiento_sisben_2009_2020 AS pct_hacinamiento, clientes_jfk, poblacion_2020 FROM base_integrada_comuna WHERE tipo='comuna' AND cobertura_x1000 IS NOT NULL AND razon_oe IS NOT NULL AND pct_hacinamiento_sisben_2009_2020 IS NOT NULL AND NOT muestra_baja), m AS (SELECT median(cobertura_x1000) AS med_cob, median(pct_hacinamiento) AS med_hac FROM c) SELECT c.*, m.med_cob, m.med_hac, cobertura_x1000 < m.med_cob AS baja_cobertura, pct_hacinamiento > m.med_hac AS alta_necesidad, razon_oe < 1 AS mora_menor_que_esperada, razon_oe_ls < 1 AS mora_menor_ic, greatest(0, round((m.med_cob - cobertura_x1000) * poblacion_2020 / 1000)) AS brecha_clientes FROM c, m ORDER BY cobertura_x1000"""

CASO_GUIA_CHART = {
    "chart_type": "scatter",
    "title": "Cobertura y razón O/E de mora por comuna (tamaño: hacinamiento Sisbén 2009-2020)",
    "x_axis": "cobertura_x1000",
    "x_axis_label": "Clientes JFK por 1.000 habitantes",
    "series": [{"key": "razon_oe", "label": "Razón O/E de mora", "type": "scatter"}],
    "size_key": "pct_hacinamiento",
    "size_label": "Hacinamiento Sisbén 2009-2020 (%)",
    "label_key": "nombre_mostrar",
}

@app.get("/caso-guia")
def caso_guia():
    """Caso guía sin modelo; responde con la misma forma que /chat."""
    try:
        df = con.execute(CASO_GUIA_SQL).fetchdf()
    except duckdb.CatalogException:
        raise HTTPException(status_code=503, detail="La base integrada no está cargada: falta integracion_datos/salida/base_integrada_comuna.parquet.")
    json_data = df.to_json(orient="records", date_format="iso")
    response_body = f'{{"status":"success","generated_sql":{json.dumps(CASO_GUIA_SQL)},"row_count":{len(df)},"chart_spec":{json.dumps(CASO_GUIA_CHART, ensure_ascii=False)},"data":{json_data}}}'
    return Response(content=response_body, media_type="application/json")

class ChatPromptRequest(BaseModel):
    prompt: str

@app.post("/chat")
def process_chat_prompt(request: ChatPromptRequest):
    """Procesa consulta con Groq, imprime logs de auditoría en consola y ejecuta SQL en DuckDB."""
    try:
        # 1. Construir prompt del sistema dinámico con el esquema 100% real de DuckDB
        system_prompt = f"""
Eres DARVIS, un asistente experto en SQL para DuckDB y visualización de datos.
Dispones de las siguientes tablas REALES en la base de datos:

{REAL_DB_SCHEMA}

REGLAS STRICTAS PARA LA CONSULTA SQL:
1. Usa ÚNICAMENTE los nombres exactos de tablas y columnas del esquema proporcionado.
2. Escribe sintaxis SQL válida para DuckDB.
3. Asegúrate de dar alias claros (AS) a las agregaciones y columnas calculadas.
4. Si no encuentras una tabla o columna, responde con un error claro en lugar de inventar nombres.

REGLAS DE SELECCIÓN Y CONFIGURACIÓN DEL GRÁFICO (chart_spec):
Aplica uno de los siguientes tipos en "chart_type" según la pregunta del usuario:

- "bar": Comparaciones entre categorías. `x_axis` es la columna categórica y `series` contiene métricas numéricas.
- "horizontal_bar": Igual a "bar", pero ideal cuando las etiquetas del eje X son largas o hay más de 10 categorías.
- "line": Evolución temporal o secuencias continuas. `x_axis` debe ser una fecha/tiempo/periodo.
- "area": Tendencias temporales donde importa visualizar el volumen acumulado.
- "pie" o "doughnut": Proporciones o distribución respecto a un 100%.
  * OBLIGATORIO: `x_axis` es la columna con los nombres del sector/categoría.
  * OBLIGATORIO: `series` debe tener EXACTAMENTE 1 elemento con el valor numérico a medir.
- "scatter": Correlación entre dos variables numéricas continuas.
  * OBLIGATORIO: `x_axis` debe ser la columna numérica independiente (X).
  * OBLIGATORIO: `series[0].key` debe ser la columna numérica dependiente (Y).
- "radar": Comparación multivariable de perfiles o atributos.
  * `x_axis` es el atributo/dimensión y `series` contiene los sujetos a comparar.
- "gauge": Indicador de un único valor o porcentaje escalar (ej. % de meta o conversión).

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con un objeto JSON estructurado exactamente así, sin bloques de texto explicativo antes ni después:

{{
  "sql": "SELECT columna_categoria, SUM(monto) AS total FROM ventas GROUP BY columna_categoria",
  "chart_spec": {{
    "chart_type": "bar | horizontal_bar | line | area | pie | doughnut | scatter | radar | gauge",
    "title": "Título descriptivo y claro sobre lo que muestra el gráfico",
    "x_axis": "nombre_columna_x_o_categoria",
    "series": [
      {{
        "key": "nombre_columna_y",
        "label": "Etiqueta visible para el usuario",
        "type": "bar | line"
      }}
    ]
  }}
}}
"""

        print(f"\n📩 [AUDITORÍA LLM] Pregunta Recibida: '{request.prompt}'")
        
        # 2. Invocación a Groq
        completion = obtener_groq().chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        raw_content = completion.choices[0].message.content
        print(f"🤖 [AUDITORÍA LLM] Respuesta Cruda de Groq:\n{raw_content}\n")

        # 3. Parsear JSON
        llm_response = json.loads(raw_content)
        generated_sql = llm_response.get("sql")
        chart_spec = llm_response.get("chart_spec")

        print(f"⚙️ [AUDITORÍA SQL] Ejecutando SQL en DuckDB:\n{generated_sql}\n")

        if not generated_sql:
            raise HTTPException(status_code=500, detail="El modelo no generó la propiedad 'sql'.")
        sql_validado = validar_sql(generated_sql)

        # 4. Ejecución en DuckDB
        df = con.execute(f"SELECT * FROM (\n{sql_validado}\n) AS resultado LIMIT {MAX_FILAS}").fetchdf()
        if MODO_COMPLETO and COLUMNAS_ID & {str(columna).upper() for columna in df.columns}:
            raise HTTPException(status_code=400, detail="La consulta devolvería identificadores; usa agregados.")
        print(f"📊 [AUDITORÍA DUCKDB] Filas Obtenidas: {len(df)}")
        print(f"📋 [AUDITORÍA DUCKDB] Vista Previa:\n{df}\n")

        json_data = df.to_json(orient="records", date_format="iso")
        
        response_body = f'{{"status":"success","generated_sql":{json.dumps(generated_sql)},"row_count":{len(df)},"chart_spec":{json.dumps(chart_spec, ensure_ascii=False)},"data":{json_data}}}'
        return Response(content=response_body, media_type="application/json")

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [AUDITORÍA ERROR]: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error al procesar solicitud: {str(e)}")