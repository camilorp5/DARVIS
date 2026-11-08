import logging
from pathlib import Path
import polars as pl
import matplotlib.pyplot as plt
import seaborn as sns

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

RAW_DIR = Path("data/raw")
PLOTS_DIR = RAW_DIR / "eda_plots"
REPORT_PATH = RAW_DIR / "EDA_REPORT.md"

# Configuración de estilo de gráficos
sns.set_theme(style="whitegrid", palette="muted")
plt.rcParams.update({"figure.autolayout": True, "font.size": 10})

FILES_CONFIG = {
    "clientes.csv": {
        "columns": [
            "ID_ASOCIADO", "ESTRATO", "RANGO_EDAD", "GENERO", "NIVEL_EDUCATIVO",
            "ESTADO_CIVIL", "PERSONAS_A_CARGO", "NUMERO_HIJOS", "TIPO_OCUPACION",
            "ACTIVIDAD_CIIU", "DECLARA_RENTA", "SEGMENTO", "ESTADO_ASOCIADO",
            "ANTIGUEDAD_MESES", "COMUNA_BARRIO", "CODIGO_DANE"
        ],
        "categoricals": ["RANGO_EDAD", "GENERO", "ESTRATO", "ESTADO_CIVIL", "NIVEL_EDUCATIVO", "SEGMENTO", "ESTADO_ASOCIADO", "DECLARA_RENTA"],
        "numerics": ["PERSONAS_A_CARGO", "NUMERO_HIJOS", "ANTIGUEDAD_MESES"],
    },
    "creditos.csv": {
        "columns": [
            "ID_CREDITO", "ID_ASOCIADO", "CLASE", "LINEA", "PLAZO", "TASA",
            "MONTO_DESEMBOLSO", "SALDO_CAPITAL", "VALOR_CUOTA", "GARANTIA",
            "FECHA_DESEMBOLSO", "FECHA_ULT_MORA", "FECHA_CANCELACION", "ESTADO"
        ],
        "categoricals": ["CLASE", "LINEA", "GARANTIA", "ESTADO"],
        "numerics": ["PLAZO", "TASA", "MONTO_DESEMBOLSO", "SALDO_CAPITAL", "VALOR_CUOTA"],
    },
    "saldos.csv": {
        "columns": [
            "ID_CREDITO", "FECHA_CORTE", "SALDO_CAPITAL", "DIAS_MORA",
            "CUOTAS_MORA", "CUOTAS_PAGAS", "INTERES_MORA", "GASTOS_COBRANZA", "ESTADO"
        ],
        "categoricals": ["ESTADO", "FECHA_CORTE"],
        "numerics": ["SALDO_CAPITAL", "DIAS_MORA", "CUOTAS_MORA", "CUOTAS_PAGAS", "INTERES_MORA", "GASTOS_COBRANZA"],
    },
    "movimientos.csv": {
        "columns": [
            "ID_EVENTO", "ID_CREDITO", "FECHA", "CODIGO_TRANSACCION", "NATURALEZA",
            "VALOR_CAPITAL", "VALOR_INTERES", "VALOR_MORA", "TASA_APLICADA", "CUOTA_APLICADA"
        ],
        "categoricals": ["CODIGO_TRANSACCION", "NATURALEZA"],
        "numerics": ["VALOR_CAPITAL", "VALOR_INTERES", "VALOR_MORA", "TASA_APLICADA", "CUOTA_APLICADA"],
    }
}

def safe_numeric_cast(col_name: str, dtype: pl.DataType) -> pl.Expr:
    """
    Ruta defensiva de conversión numérica:
    - Si es String: remueve comas decimales/espacios antes de castear a Float64.
    - Si ya es numérico: aplica casteo directo a Float64.
    """
    if dtype in [pl.String, pl.Categorical]:
        return (
            pl.col(col_name)
            .str.strip_chars()
            .str.replace(",", ".")
            .cast(pl.Float64, strict=False)
        )
    return pl.col(col_name).cast(pl.Float64, strict=False)

def analyze_file(filename: str, config: dict, report_lines: list):
    filepath = RAW_DIR / filename
    if not filepath.exists():
        logging.warning(f"Archivo no encontrado: {filepath}. Se omite.")
        return

    print("\n" + "=" * 80)
    print(f"   ANÁLISIS EXPLORATORIO DE DATOS (EDA): {filename.upper()}")
    print("=" * 80)

    report_lines.append(f"# Informe EDA: `{filename}`\n")

    # 1. Escaneo perezoso y chequeo de encabezados
    sample = pl.read_csv(filepath, separator=";", n_rows=2, has_header=False, ignore_errors=True)
    first_cell = str(sample.row(0)[0]) if sample.height > 0 else ""
    has_header = first_cell in config["columns"]

    df_lazy = pl.scan_csv(
        filepath,
        separator=";",
        has_header=has_header,
        new_columns=config["columns"] if not has_header else None,
        ignore_errors=True,
        truncate_ragged_lines=True,
    )

    total_rows = df_lazy.select(pl.len()).collect().item()
    print(f"\n---> Total de Registros: {total_rows:,}\n")
    report_lines.append(f"**Total de Registros:** `{total_rows:,}`\n")

    # 2. Inspección de Esquema (Nombres y Data Types)
    schema = df_lazy.collect_schema()
    print("--- 1. ESQUEMA DE DATOS (COLUMNAS Y TIPOS DETECTADOS) ---")
    
    report_lines.append("## 1. Esquema de Datos y Tipos Detectados\n")
    report_lines.append("| Columna | Tipo Inferido Polars | Categoría Asignada |")
    report_lines.append("|---|---|---|")
    
    for col_name, dtype in schema.items():
        cat_type = "Numérica" if col_name in config["numerics"] else ("Categórica" if col_name in config["categoricals"] else "Identificador/Fecha")
        print(f" • {col_name:<20} | Tipo: {str(dtype):<15} | Rol: {cat_type}")
        report_lines.append(f"| `{col_name}` | `{dtype}` | {cat_type} |")
    report_lines.append("\n")

    # 3. Diagnóstico de Valores Nulos
    logging.info(f"[{filename}] Calculando porcentaje de nulos...")
    null_exprs = [pl.col(c).null_count().alias(c) for c in config["columns"]]
    null_counts = df_lazy.select(null_exprs).collect()
    
    null_summary = (
        null_counts.unpivot()
        .rename({"variable": "Columna", "value": "Conteo_Nulos"})
        .with_columns(
            (pl.col("Conteo_Nulos") / total_rows * 100).round(2).alias("%_Nulos")
        )
        .sort("Conteo_Nulos", descending=True)
    )
    print("\n--- 2. VALORES NULOS Y NULIDAD % ---")
    print(null_summary)

    report_lines.append("## 2. Resumen de Nulos\n")
    report_lines.append("```")
    report_lines.append(str(null_summary))
    report_lines.append("```\n")

    # Gráfico 1: Porcentaje de Nulos por Columna
    plt.figure(figsize=(10, 4))
    sns.barplot(
        data=null_summary.to_pandas(),
        x="%_Nulos",
        y="Columna",
        hue="Columna",
        palette="viridis",
        legend=False
    )
    plt.title(f"Porcentaje de Nulos - {filename}")
    plt.xlabel("% de Nulos")
    plt.xlim(0, 100)
    plt.tight_layout()
    null_plot_file = PLOTS_DIR / f"{filename}_nulls.png"
    plt.savefig(null_plot_file, dpi=300)
    plt.close()

    report_lines.append(f"![Nulos]({null_plot_file.relative_to(RAW_DIR)})\n")

    # 4. Frecuencias / Value Counts (Variables Categóricas)
    print("\n--- 3. VALUE COUNTS (TOP CATEGORÍAS) ---")
    report_lines.append("## 3. Distribuciones Categóricas Clave\n")

    for cat_col in config["categoricals"]:
        if cat_col in config["columns"]:
            vc = (
                df_lazy.group_by(cat_col)
                .agg(pl.len().alias("Frecuencia"))
                .with_columns((pl.col("Frecuencia") / total_rows * 100).round(2).alias("%_Del_Total"))
                .sort("Frecuencia", descending=True)
                .head(8)
                .collect()
            )
            print(f"\n[Value Counts: {cat_col}]")
            print(vc)

            # Graficar Top Categorías
            plt.figure(figsize=(8, 3.5))
            sns.barplot(
                data=vc.to_pandas(),
                x="Frecuencia",
                y=cat_col,
                hue=cat_col,
                palette="mako",
                legend=False
            )
            plt.title(f"Distribución de {cat_col} ({filename})")
            plt.tight_layout()
            cat_plot_file = PLOTS_DIR / f"{filename}_cat_{cat_col}.png"
            plt.savefig(cat_plot_file, dpi=300)
            plt.close()

    # 5. Estadísticas Descriptivas y Diagrama de Cajas (Outliers)
    print("\n--- 4. ESTADÍSTICAS DESCRIPTIVAS Y OUTLIERS (NUMÉRICAS) ---")
    report_lines.append("## 4. Análisis Numérico y Outliers\n")

    num_cols_present = [c for c in config["numerics"] if c in config["columns"]]
    
    if num_cols_present:
        # Aplicar casteo seguro según tipo detectado
        select_exprs = [safe_numeric_cast(c, schema[c]).alias(c) for c in num_cols_present]
        df_num = df_lazy.select(select_exprs).collect()

        desc_df = df_num.describe()
        print(desc_df)

        report_lines.append("```")
        report_lines.append(str(desc_df))
        report_lines.append("```\n")

        # Gráfico 2: Diagrama de Cajas y Bigotes (Boxplots)
        num_pd = df_num.to_pandas()
        for col in num_cols_present:
            valid_series = num_pd[col].dropna()
            # Filtrar valor centinela 999 para que el gráfico sea interpretable
            filtered_series = valid_series[valid_series != 999]

            if not filtered_series.empty:
                plt.figure(figsize=(8, 2.5))
                sns.boxplot(x=filtered_series, color="skyblue", fliersize=3)
                plt.title(f"Diagrama de Cajas (Outliers) - {col} ({filename})")
                plt.xlabel(col)
                plt.tight_layout()
                box_plot_file = PLOTS_DIR / f"{filename}_box_{col}.png"
                plt.savefig(box_plot_file, dpi=300)
                plt.close()
                
                report_lines.append(f"![Boxplot {col}]({box_plot_file.relative_to(RAW_DIR)})\n")

    # 6. Detección de Valores Centinela / Anómalos
    print("\n--- 5. REGISTROS CON VALORES CENTINELA (EJ. 999 O NEGATIVOS) ---")
    anom_exprs = []
    for c in num_cols_present:
        col_expr = safe_numeric_cast(c, schema[c])
        anom_exprs.extend([
            (col_expr == 999).sum().alias(f"{c}_igual_999"),
            (col_expr < 0).sum().alias(f"{c}_negativos"),
        ])
    
    if anom_exprs:
        anom_df = df_lazy.select(anom_exprs).collect().unpivot().rename({"variable": "Métrica", "value": "Conteo"})
        print(anom_df)
        report_lines.append("### Detección de Registros Anómalos / Centinela\n")
        report_lines.append("```")
        report_lines.append(str(anom_df))
        report_lines.append("```\n")

    report_lines.append("\n---\n")

def run_full_eda():
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    logging.info(f"Directorio de gráficos preparado en: {PLOTS_DIR}")

    report_lines = [
        "# INFORME CONSOLIDADO DE ANÁLISIS EXPLORATORIO DE DATOS (EDA)\n",
        "**Proyecto:** Hackathon JFK Cooperativa Financiera 2026  \n",
        "**Motor de Procesamiento:** Polars (Lazy Evaluation)  \n",
        "\n---\n"
    ]

    for filename, config in FILES_CONFIG.items():
        analyze_file(filename, config, report_lines)

    # Exportación del informe en formato Markdown
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.writelines("\n".join(report_lines))

    logging.info(f"Informe de EDA guardado exitosamente en: {REPORT_PATH}")

if __name__ == "__main__":
    run_full_eda()