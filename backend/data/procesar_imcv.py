from pathlib import Path
import pandas as pd

# 1. Definición de rutas (utilizando Path para compatibilidad de SO)
INPUT_PATH = Path(
    "/Users/user/Documents/GitHub/DARVIS/backend/data/raw/indice_multidimensional_encuesta_calidad_de_vida.csv"
)

# Se asume la estructura del proyecto DARVIS basándose en la ruta de entrada
OUTPUT_DIR = Path(
    "/Users/user/Documents/GitHub/DARVIS/backend/data/processed"
)
OUTPUT_PATH = OUTPUT_DIR / "indice_multidimensional_calidad_vida.parquet"

# En procesar_imcv.py:
MAPEO_COMUNAS = {
    1: "POPULAR",
    2: "SANTA CRUZ",
    3: "MANRIQUE",
    4: "ARANJUEZ",
    5: "CASTILLA",
    6: "DOCE DE OCTUBRE",
    7: "ROBLEDO",
    8: "VILLA HERMOSA",
    9: "BUENOS AIRES",
    10: "LA CANDELARIA",
    11: "LAURELES-ESTADIO",
    12: "LA AMERICA",
    13: "SAN JAVIER",
    14: "POBLADO",  # OJO: en JFK usan POBLADO, no EL POBLADO
    15: "GUAYABAL",
    16: "BELEN",
    50: "PALMITAS",
    60: "SAN CRISTOBAL",
    70: "ALTAVISTA",
    80: "SAN ANTONIO DE PRADO",
    90: "SANTA ELENA",
}


def procesar_datos():
    # Cargar el archivo CSV reconociendo la cadena 'NULL' como valor nulo
    df = pd.read_csv(INPUT_PATH, na_values=["NULL", "null", "Null"])

    # Normalizar códigos de comuna a entero para el mapeo (eliminando ceros a la izquierda si vienen como texto)
    df["varcharidcomunafk"] = pd.to_numeric(
        df["varcharidcomunafk"], errors="coerce"
    )

    # Eliminar filas donde la mayoría de columnas sean nulas
    # thresh define el mínimo de valores no nulos requeridos para conservar la fila
    # Exigimos al menos el 50% de campos diligenciados
    min_valores_validos = len(df.columns) // 2
    df = df.dropna(thresh=min_valores_validos)

    # Reemplazar los códigos numéricos por los nombres de las comunas
    df["varcharidcomunafk"] = df["varcharidcomunafk"].map(MAPEO_COMUNAS)

    # Asegurar que la carpeta de destino existe
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Exportar DataFrame procesado a formato Parquet (requiere pyarrow o fastparquet)
    df.to_parquet(OUTPUT_PATH, index=False)

    print(
        f"Procesamiento completado con éxito. Archivo guardado en: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    procesar_datos()