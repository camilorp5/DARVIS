from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import duckdb
import os

app = FastAPI(title="Hackathon ITM - JFK Analytics Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

con = duckdb.connect(database=':memory:')

@app.on_event("startup")
def setup_database():
    tables = ["clientes", "creditos", "saldos", "movimientos"]
    for table in tables:
        parquet_file = f"data/processed/{table}.parquet" if os.path.exists(f"data/processed/{table}.parquet") else f"{table}.parquet"
        if os.path.exists(parquet_file):
            print(f"✅ Cargando tabla '{table}' desde '{parquet_file}'...")
            con.execute(f"CREATE TABLE IF NOT EXISTS {table} AS SELECT * FROM '{parquet_file}';")
        else:
            print(f"⚠️ Advertencia: No se encontró '{parquet_file}'.")

class QueryRequest(BaseModel):
    sql: str

@app.post("/query")
def execute_query(request: QueryRequest):
    """Ejecuta SQL y devuelve JSON 100% seguro contra valores NaN/Infiniy."""
    try:
        # 1. Ejecutar consulta en DuckDB
        df = con.execute(request.sql).fetchdf()
        
        # 2. Pandas convierte NaN e Infinity a null de forma nativa en string JSON
        json_data = df.to_json(orient="records", date_format="iso")
        
        # 3. Ensamblar el JSON final sin pasar por json.dumps de Python
        response_body = f'{{"status":"success","row_count":{len(df)},"data":{json_data}}}'
        
        return Response(content=response_body, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en consulta SQL: {str(e)}")