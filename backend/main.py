from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import duckdb
import os
import json
from groq import Groq
from dotenv import load_dotenv

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
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Variable global para almacenar el esquema real extraído de los Parquet
REAL_DB_SCHEMA = ""

@app.on_event("startup")
def setup_database():
    global REAL_DB_SCHEMA
    tables = ["clientes", "creditos", "saldos", "movimientos"]
    schema_parts = []
    
    print("\n=== 🔍 INSPECCIONANDO TABLAS Y COLUMNAS REALES ===")
    for table in tables:
        parquet_file = f"data/processed/{table}.parquet" if os.path.exists(f"data/processed/{table}.parquet") else f"{table}.parquet"
        if os.path.exists(parquet_file):
            con.execute(f"CREATE TABLE IF NOT EXISTS {table} AS SELECT * FROM '{parquet_file}';")
            # Extraer nombres reales de columnas y tipos de datos
            columns_info = con.execute(f"DESCRIBE {table};").fetchall()
            cols_str = ", ".join([f"{col[0]} ({col[1]})" for col in columns_info])
            schema_parts.append(f"Tabla '{table}': {cols_str}")
            print(f"✅ {table}: [{cols_str}]")
        else:
            print(f"⚠️ No se encontró '{parquet_file}'.")
            
    REAL_DB_SCHEMA = "\n".join(schema_parts)
    print("==================================================\n")

class ChatPromptRequest(BaseModel):
    prompt: str

@app.post("/chat")
def process_chat_prompt(request: ChatPromptRequest):
    """Procesa consulta con Groq, imprime logs de auditoría en consola y ejecuta SQL en DuckDB."""
    try:
        # 1. Construir prompt del sistema dinámico con el esquema 100% real de DuckDB
        system_prompt = f"""
Eres DARVIS, un asistente experto en SQL para DuckDB.
Dispones de las siguientes tablas REALES en la base de datos:

{REAL_DB_SCHEMA}

REGLAS STRICTAS DE RESPUESTA:
1. Usa ÚNICAMENTE los nombres exactos de columnas listados en el esquema. No inventes columnas como 'sexo' o 'status' si no existen.
2. Genera una consulta SQL válida para DuckDB basada en la pregunta del usuario.
3. NUNCA incluyas explicaciones en texto fuera del objeto JSON.
4. Responde ÚNICAMENTE en formato JSON con la estructura:
{{
  "sql": "SELECT ...",
  "chart_spec": {{
    "chart_type": "bar",
    "title": "Título descriptivo del gráfico",
    "x_axis": "columna_eje_x",
    "series": [
      {{"key": "columna_eje_y1", "label": "Etiqueta 1", "type": "bar"}}
    ]
  }}
}}
"""

        print(f"\n📩 [AUDITORÍA LLM] Pregunta Recibida: '{request.prompt}'")
        
        # 2. Invocación a Groq
        completion = groq_client.chat.completions.create(
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

        # 4. Ejecución en DuckDB
        df = con.execute(generated_sql).fetchdf()
        print(f"📊 [AUDITORÍA DUCKDB] Filas Obtenidas: {len(df)}")
        print(f"📋 [AUDITORÍA DUCKDB] Vista Previa:\n{df.head(10)}\n")

        json_data = df.to_json(orient="records", date_format="iso")
        
        response_body = f'{{"status":"success","generated_sql":{json.dumps(generated_sql)},"row_count":{len(df)},"chart_spec":{json.dumps(chart_spec, ensure_ascii=False)},"data":{json_data}}}'
        return Response(content=response_body, media_type="application/json")

    except Exception as e:
        print(f"❌ [AUDITORÍA ERROR]: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error al procesar solicitud: {str(e)}")