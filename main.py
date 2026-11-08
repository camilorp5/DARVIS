from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import duckdb

app = FastAPI(title="Hackathon ITM - DuckDB Engine")

# Inicialización de DuckDB en memoria al arrancar el servidor
con = duckdb.connect(database=':memory:')

@app.on_event("startup")
def setup_database():
    """
    Carga inicial de datos. 
    En producción reemplazarás los DataFrames simulados por tu archivo parquet:
    con.execute("CREATE TABLE clientes AS SELECT * FROM 'clientes.parquet'")
    """
    # 1. Tabla simulada de Clientes / MEData
    con.execute("""
        CREATE TABLE clientes (
            ID_ASOCIADO VARCHAR,
            COMUNA_BARRIO VARCHAR,
            ESTRATO INT,
            IPM_COMUNA FLOAT
        );
    """)
    con.execute("""
        INSERT INTO clientes VALUES 
        ('ASOC_1', 'Comuna 1 - Popular', 1, 32.5),
        ('ASOC_2', 'Comuna 1 - Popular', 2, 32.5),
        ('ASOC_3', 'Comuna 10 - La Candelaria', 3, 18.2),
        ('ASOC_4', 'Comuna 10 - La Candelaria', 2, 18.2),
        ('ASOC_5', 'Comuna 16 - Belén', 4, 10.1);
    """)

    # 2. Tabla simulada de Saldos
    con.execute("""
        CREATE TABLE saldos (
            ID_ASOCIADO VARCHAR,
            SALDO_CAPITAL DOUBLE,
            DIAS_MORA INT
        );
    """)
    con.execute("""
        INSERT INTO saldos VALUES 
        ('ASOC_1', 5000000, 45),
        ('ASOC_2', 12000000, 0),
        ('ASOC_3', 25000000, 90),
        ('ASOC_4', 8000000, 15),
        ('ASOC_5', 45000000, 0);
    """)

class QueryRequest(BaseModel):
    sql: str

@app.post("/query")
def execute_query(request: QueryRequest):
    """Ejecuta una consulta SQL en DuckDB y la retorna en formato JSON serializable."""
    try:
        # Ejecuta la consulta SQL y convierte el resultado a un DataFrame de pandas
        df = con.execute(request.sql).fetchdf()
        
        # Convierte el DataFrame a formato lista de diccionarios JSON
        result = df.to_dict(orient="records")
        
        return {
            "status": "success",
            "row_count": len(result),
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en consulta SQL: {str(e)}")