import duckdb
import time

print("Iniciando conversión de CSV a Parquet con DuckDB...")
start_time = time.time()

con = duckdb.connect()

# Lista de archivos CSV a convertir
archivos = ["clientes", "creditos", "saldos", "movimientos", "medata"]

for archivo in archivos:
    try:
        print(f"Convirtiendo {archivo}.csv -> {archivo}.parquet...")
        # DuckDB infiere los tipos de datos y exporta directamente a Parquet
        con.execute(f"""
            COPY (SELECT * FROM read_csv_auto('{archivo}.csv')) 
            TO '{archivo}.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY);
        """)
        print(f"✅ {archivo}.parquet creado exitosamente.")
    except Exception as e:
        print(f"⚠️ Error procesando {archivo}.csv: {e}")

print(f"Proceso finalizado en {round(time.time() - start_time, 2)} segundos.")