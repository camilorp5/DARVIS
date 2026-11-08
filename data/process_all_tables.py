import logging
from pathlib import Path
import polars as pl

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")

# ==============================================================================
# 1. CLIENTES.CSV
# ==============================================================================
def process_clientes():
    logging.info("Procesando [clientes.csv]...")
    raw_path = RAW_DIR / "clientes.csv"
    out_path = PROCESSED_DIR / "clientes.parquet"

    columns = [
        "ID_ASOCIADO", "ESTRATO", "RANGO_EDAD", "GENERO", "NIVEL_EDUCATIVO",
        "ESTADO_CIVIL", "PERSONAS_A_CARGO", "NUMERO_HIJOS", "TIPO_OCUPACION",
        "ACTIVIDAD_CIIU", "DECLARA_RENTA", "SEGMENTO", "ESTADO_ASOCIADO",
        "ANTIGUEDAD_MESES", "COMUNA_BARRIO", "CODIGO_DANE"
    ]

    q = (
        pl.scan_csv(
            raw_path,
            separator=";",
            has_header=False,
            new_columns=columns,
            ignore_errors=True,
            truncate_ragged_lines=True,
        )
        # Separación defensiva de BARRIO y MUNICIPIO
        .with_columns([
            pl.col("COMUNA_BARRIO")
            .str.split("-")
            .list.get(0, null_on_oob=True)
            .str.strip_chars()
            .alias("BARRIO_COMUNA"),

            pl.col("COMUNA_BARRIO")
            .str.split("-")
            .list.get(1, null_on_oob=True)
            .str.strip_chars()
            .alias("MUNICIPIO_DEPTO"),
        ])
        # Filtrado de Bogotá DC
        .filter(
            ~pl.col("MUNICIPIO_DEPTO")
            .fill_null("")
            .str.to_uppercase()
            .str.contains("BOGOTA|BOGOTÁ")
        )
        # Paso 1.1: Eliminar columnas 100% nulas y columna original parseada
        .drop(["NUMERO_HIJOS", "CODIGO_DANE", "COMUNA_BARRIO"])
        # Paso 1.2 & 1.3: Tratamiento de ANTIGUEDAD_MESES y PERSONAS_A_CARGO (Capping a 10)
        .with_columns([
            pl.col("ANTIGUEDAD_MESES").cast(pl.Int64, strict=False),
            pl.col("PERSONAS_A_CARGO").cast(pl.Int64, strict=False),
            pl.col("ESTRATO").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("RANGO_EDAD").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("GENERO").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("BARRIO_COMUNA").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("MUNICIPIO_DEPTO").cast(pl.String).fill_null("SIN_INFORMACION"),
        ])
        .with_columns([
            # Antigüedad < 0 pasa a 0; 999 se marca como nulo
            pl.when(pl.col("ANTIGUEDAD_MESES") == 999)
            .then(None)
            .when(pl.col("ANTIGUEDAD_MESES") < 0)
            .then(0)
            .otherwise(pl.col("ANTIGUEDAD_MESES"))
            .alias("ANTIGUEDAD_MESES"),

            # Capping de PERSONAS_A_CARGO a máximo 10
            pl.when(pl.col("PERSONAS_A_CARGO") > 10)
            .then(10)
            .when(pl.col("PERSONAS_A_CARGO") < 0)
            .then(0)
            .otherwise(pl.col("PERSONAS_A_CARGO"))
            .alias("PERSONAS_A_CARGO"),
        ])
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    q.sink_parquet(out_path, compression="snappy")
    logging.info(f"[clientes.parquet] guardado exitosamente en: {out_path}")


# ==============================================================================
# 2. CREDITOS.CSV
# ==============================================================================
def process_creditos():
    logging.info("Procesando [creditos.csv]...")
    raw_path = RAW_DIR / "creditos.csv"
    out_path = PROCESSED_DIR / "creditos.parquet"

    columns = [
        "ID_CREDITO", "ID_ASOCIADO", "CLASE", "LINEA", "PLAZO", "TASA",
        "MONTO_DESEMBOLSO", "SALDO_CAPITAL", "VALOR_CUOTA", "GARANTIA",
        "FECHA_DESEMBOLSO", "FECHA_ULT_MORA", "FECHA_CANCELACION", "ESTADO"
    ]

    q = (
        pl.scan_csv(
            raw_path,
            separator=";",
            has_header=False,
            new_columns=columns,
            ignore_errors=True,
            truncate_ragged_lines=True,
        )
        # Paso 3.1: Estandarizar TASA a porcentaje (TASA * 100)
        .with_columns([
            pl.col("PLAZO").cast(pl.Int64, strict=False),
            (pl.col("TASA").cast(pl.Float64, strict=False) * 100.0).round(4).alias("TASA"),
            pl.col("MONTO_DESEMBOLSO").cast(pl.Float64, strict=False),
            pl.col("SALDO_CAPITAL").cast(pl.Float64, strict=False),
            pl.col("VALOR_CUOTA").cast(pl.Float64, strict=False),
            pl.col("GARANTIA").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("CLASE").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("LINEA").cast(pl.String).fill_null("SIN_INFORMACION"),
            pl.col("ESTADO").cast(pl.String).fill_null("SIN_INFORMACION"),
        ])
    )

    q.sink_parquet(out_path, compression="snappy")
    logging.info(f"[creditos.parquet] guardado exitosamente en: {out_path}")


# ==============================================================================
# 3. SALDOS.CSV
# ==============================================================================
def process_saldos():
    logging.info("Procesando [saldos.csv]...")
    raw_path = RAW_DIR / "saldos.csv"
    out_path = PROCESSED_DIR / "saldos.parquet"

    columns = [
        "ID_CREDITO", "FECHA_CORTE", "SALDO_CAPITAL", "DIAS_MORA",
        "CUOTAS_MORA", "CUOTAS_PAGAS", "INTERES_MORA", "GASTOS_COBRANZA", "ESTADO"
    ]

    q = (
        pl.scan_csv(
            raw_path,
            separator=";",
            has_header=False,
            new_columns=columns,
            ignore_errors=True,
            truncate_ragged_lines=True,
        )
        # Paso 2.1: DIAS_MORA == 999 -> ES_CASTIGADO = 1 y ajuste de días
        .with_columns([
            pl.col("DIAS_MORA").cast(pl.Int64, strict=False),
            pl.col("SALDO_CAPITAL").cast(pl.Float64, strict=False),
            pl.col("INTERES_MORA").cast(pl.Float64, strict=False),
            pl.col("GASTOS_COBRANZA").cast(pl.Float64, strict=False),
        ])
        .with_columns([
            # Flag categórica de crédito en cobro judicial/castigado
            pl.when(pl.col("DIAS_MORA") == 999)
            .then(1)
            .otherwise(0)
            .alias("ES_CASTIGADO"),

            # Reemplazar DIAS_MORA < 0 por 0, y 999 por NULL para no distorsionar promedios
            pl.when(pl.col("DIAS_MORA") == 999)
            .then(None)
            .when(pl.col("DIAS_MORA") < 0)
            .then(0)
            .otherwise(pl.col("DIAS_MORA"))
            .alias("DIAS_MORA"),
        ])
    )

    q.sink_parquet(out_path, compression="snappy")
    logging.info(f"[saldos.parquet] guardado exitosamente en: {out_path}")


# ==============================================================================
# 4. MOVIMIENTOS.CSV
# ==============================================================================
def process_movimientos():
    logging.info("Procesando [movimientos.csv]...")
    raw_path = RAW_DIR / "movimientos.csv"
    out_path = PROCESSED_DIR / "movimientos.parquet"

    columns = [
        "ID_EVENTO", "ID_CREDITO", "FECHA", "CODIGO_TRANSACCION", "NATURALEZA",
        "VALOR_CAPITAL", "VALOR_INTERES", "VALOR_MORA", "TASA_APLICADA", "CUOTA_APLICADA"
    ]

    q = (
        pl.scan_csv(
            raw_path,
            separator=";",
            has_header=False,
            new_columns=columns,
            ignore_errors=True,
            truncate_ragged_lines=True,
        )
        # Paso 2.2: CUOTA_APLICADA > 240 pasa a NULL
        .with_columns([
            pl.col("CUOTA_APLICADA").cast(pl.Int64, strict=False),
            pl.col("VALOR_CAPITAL").cast(pl.Float64, strict=False),
            pl.col("VALOR_INTERES").cast(pl.Float64, strict=False),
            pl.col("VALOR_MORA").cast(pl.Float64, strict=False),
            pl.col("TASA_APLICADA").cast(pl.Float64, strict=False),
        ])
        .with_columns([
            pl.when((pl.col("CUOTA_APLICADA") > 240) | (pl.col("CUOTA_APLICADA") < 0))
            .then(None)
            .otherwise(pl.col("CUOTA_APLICADA"))
            .alias("CUOTA_APLICADA")
        ])
    )

    q.sink_parquet(out_path, compression="snappy")
    logging.info(f"[movimientos.parquet] guardado exitosamente en: {out_path}")


def run_pipeline():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    logging.info("Iniciando pipeline de limpieza global...")

    process_clientes()
    process_creditos()
    process_saldos()
    process_movimientos()

    logging.info("Pipeline finalizado con éxito. Todos los archivos están en data/processed/*.parquet")


if __name__ == "__main__":
    run_pipeline()