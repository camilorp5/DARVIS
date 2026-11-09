# Calidad de la integración [PRELIMINAR]

Solo agregados, sin identificadores. Los códigos se usan como categorías, sin interpretar su significado.

## 1. Cobertura del mapeo por método

| Método | Etiquetas | Clientes | % sobre Medellín | % sobre los que tienen barrio |
|---|---|---|---|---|
| comuna_exacta | 16 | 143.845 | 34,16 % | 38,29 % |
| barrio_hacinamiento | 194 | 173.282 | 41,15 % | 46,13 % |
| prefijo_comuna | 43 | 27.106 | 6,44 % | 7,22 % |
| alias_verificado | 8 | 8.550 | 2,03 % | 2,28 % |
| alias_supuesto | 1 | 3.231 | 0,77 % | 0,86 % |
| ambiguo | 2 | 928 | 0,22 % | 0,25 % |
| sin_mapeo | 130 | 18.696 | 4,44 % | 4,98 % |
| sin_informacion | 1 | 45.411 | 10,79 % | -- |
| **aplicado, sin supuestos** | 261 | 352.783 | 83,79 % | 93,92 % |

**Supuesto documentado:** `CENTRO → LA CANDELARIA` (`alias_supuesto`) es un supuesto no verificable en los datos. Afecta a 3.231 clientes, que solo cuentan en `clientes_jfk_con_supuestos`.

## 2. Etiquetas sin_mapeo con más clientes (máximo 30, con 10 o más)

| Etiqueta | Clientes |
|---|---|
| CAICEDO LA TOMA | 3.435 |
| RODEO ALTO | 1.673 |
| EL RODEO | 1.464 |
| BARICHARA | 1.263 |
| LA AURORA | 836 |
| EL BOSQUE | 569 |
| EL VERGEL | 568 |
| SAN BLAS | 396 |
| MANZANARES | 363 |
| ARAGON | 359 |
| PABLO ESCOBAR | 307 |
| COLINAS DE ENCISO | 306 |
| LOMA DEL INDIO | 280 |
| EL JARDIN | 275 |
| GRATAMIRA | 251 |
| PARIS | 230 |
| LA ALMERIA | 211 |
| MAYORCA | 203 |
| SANTA RITA | 198 |
| QUINTA LINDA | 191 |
| SAN RAFAEL | 185 |
| HORIZONTES | 182 |
| LAS MARGARITAS | 177 |
| LA DIVISA | 167 |
| METROPOLITANA | 167 |
| LAS FLORES | 138 |
| NUEVO OCCIDENTE | 135 |
| VILLA FLOREZ | 135 |
| VALLEJUELOS | 132 |
| PARALELA | 129 |

## 3. Celdas de estandarización

| Variable candidata | Con dato | ¿Se usa? |
|---|---|---|
| edad en rangos | 100,00 % | sí |
| estrato | 100,00 % | sí |
| código de línea | 100,00 % | sí |

- Variables usadas: RANGO_EDAD, ESTRATO, LINEA.
- Referencia: los registros crédito-corte de los 21 territorios, sin el supuesto.
- Celdas finales: 1.008, sobre 1.043.695 registros.
- Celdas con menos de 30 registros agrupadas en `otros`: 628 (9.229 registros).
- Se muestran las 100 celdas con más registros. La tabla completa está en `celdas_estandarizacion.parquet`.

| Celda | Registros | Tasa de mora |
|---|---|---|
| 35-49 / 2 / 217 | 70.077 | 10,42 % |
| 25-34 / 2 / 217 | 69.596 | 11,63 % |
| 35-49 / 3 / 217 | 41.252 | 10,53 % |
| 25-34 / 3 / 217 | 39.943 | 11,65 % |
| 50-64 / 2 / 217 | 34.885 | 6,61 % |
| 50-64 / 3 / 217 | 24.401 | 6,60 % |
| 35-49 / 2 / 219 | 23.860 | 12,45 % |
| 25-34 / 1 / 217 | 22.073 | 9,92 % |
| 35-49 / 1 / 217 | 20.151 | 6,78 % |
| 50-64 / 2 / 219 | 18.773 | 8,06 % |
| 35-49 / 3 / 219 | 15.871 | 12,89 % |
| 50-64 / 3 / 219 | 13.997 | 7,34 % |
| 25-34 / 2 / 219 | 13.191 | 14,56 % |
| 65+ / 2 / 217 | 12.835 | 4,72 % |
| 65+ / 3 / 217 | 12.223 | 6,26 % |
| 18-24 / 2 / 217 | 10.937 | 7,33 % |
| 50-64 / 2 / 56 | 9.910 | 6,51 % |
| 35-49 / 2 / 263 | 9.666 | 12,83 % |
| 35-49 / 2 / 56 | 9.537 | 11,28 % |
| otros | 9.229 | 8,49 % |
| 35-49 / 3 / 263 | 9.056 | 13,01 % |
| 65+ / 3 / 219 | 8.327 | 3,89 % |
| 50-64 / 1 / 217 | 8.234 | 7,76 % |
| 65+ / 2 / 219 | 8.230 | 5,36 % |
| 50-64 / 3 / 56 | 8.216 | 8,78 % |
| 35-49 / 2 / 307 | 7.861 | 1,62 % |
| 25-34 / 2 / 307 | 7.355 | 3,03 % |
| 35-49 / 2 / 68 | 7.320 | 13,58 % |
| 35-49 / 3 / 56 | 7.257 | 14,52 % |
| 25-34 / 3 / 219 | 7.252 | 16,63 % |
| 25-34 / 2 / 263 | 6.692 | 13,49 % |
| 35-49 / 3 / 68 | 6.139 | 16,04 % |
| 35-49 / 1 / 219 | 6.126 | 9,66 % |
| 50-64 / 2 / 68 | 6.105 | 12,14 % |
| 25-34 / 3 / 263 | 6.036 | 11,86 % |
| 18-24 / 3 / 217 | 5.957 | 8,28 % |
| 50-64 / 3 / 68 | 5.752 | 9,82 % |
| 25-34 / 2 / 56 | 5.417 | 11,15 % |
| 35-49 / 3 / 307 | 5.160 | 3,33 % |
| 50-64 / 3 / 263 | 4.909 | 6,31 % |
| 50-64 / 2 / 307 | 4.837 | 1,14 % |
| 25-34 / 3 / 56 | 4.785 | 14,71 % |
| 25-34 / 3 / 307 | 4.667 | 2,36 % |
| 25-34 / 4 / 217 | 4.617 | 7,73 % |
| 35-49 / 4 / 217 | 4.602 | 8,11 % |
| 50-64 / 3 / 307 | 4.472 | 1,74 % |
| 25-34 / 2 / 218 | 4.309 | 14,62 % |
| 18-24 / 1 / 217 | 4.274 | 11,89 % |
| 50-64 / 2 / 263 | 4.268 | 8,15 % |
| 65+ / 2 / 56 | 4.215 | 4,22 % |
| 65+ / 3 / 56 | 4.172 | 5,85 % |
| 50-64 / 1 / 219 | 4.061 | 6,01 % |
| 50-64 / 2 / 121 | 3.925 | 7,36 % |
| 35-49 / 2 / 315 | 3.885 | 1,13 % |
| 35-49 / 2 / 54 | 3.778 | 24,62 % |
| 35-49 / 2 / 218 | 3.769 | 14,67 % |
| 25-34 / 1 / 219 | 3.717 | 13,75 % |
| 25-34 / 2 / 68 | 3.477 | 16,39 % |
| 50-64 / 2 / 315 | 3.264 | 0,12 % |
| 25-34 / 3 / 218 | 3.002 | 15,22 % |
| 50-64 / 4 / 217 | 2.981 | 5,47 % |
| 35-49 / 3 / 54 | 2.942 | 21,45 % |
| 25-34 / 2 / 315 | 2.860 | 0,87 % |
| 35-49 / 3 / 218 | 2.832 | 19,60 % |
| 25-34 / 3 / 68 | 2.817 | 16,33 % |
| 50-64 / 2 / 54 | 2.794 | 16,39 % |
| 50-64 / 2 / 65 | 2.746 | 5,86 % |
| 35-49 / 2 / 299 | 2.714 | 3,98 % |
| 50-64 / 3 / 54 | 2.615 | 12,50 % |
| 35-49 / 2 / 241 | 2.519 | 5,00 % |
| 25-34 / 2 / 299 | 2.461 | 2,56 % |
| 50-64 / 1 / 56 | 2.437 | 3,90 % |
| 35-49 / 1 / 307 | 2.422 | 1,98 % |
| 35-49 / 4 / 219 | 2.411 | 14,81 % |
| 35-49 / 1 / 263 | 2.387 | 10,05 % |
| 65+ / 4 / 217 | 2.358 | 3,77 % |
| 50-64 / 3 / 65 | 2.341 | 9,01 % |
| 35-49 / 3 / 315 | 2.318 | 0,86 % |
| 65+ / 1 / 217 | 2.310 | 1,60 % |
| 50-64 / 4 / 219 | 2.292 | 7,16 % |
| 35-49 / 1 / 56 | 2.253 | 8,12 % |
| 65+ / 2 / 68 | 2.230 | 12,65 % |
| 35-49 / 2 / 121 | 2.101 | 15,66 % |
| 50-64 / 2 / 299 | 2.047 | 1,07 % |
| 50-64 / 1 / 121 | 2.026 | 3,46 % |
| 50-64 / 3 / 315 | 2.005 | 0,40 % |
| 35-49 / 3 / 241 | 1.984 | 9,88 % |
| 65+ / 4 / 219 | 1.954 | 4,76 % |
| 65+ / 3 / 68 | 1.935 | 6,41 % |
| 50-64 / 4 / 56 | 1.884 | 4,83 % |
| 50-64 / 3 / 121 | 1.883 | 10,73 % |
| 50-64 / 2 / 218 | 1.874 | 8,59 % |
| 25-34 / 1 / 307 | 1.847 | 2,71 % |
| 18-24 / 2 / 307 | 1.787 | 4,48 % |
| 25-34 / 1 / 263 | 1.765 | 15,86 % |
| 35-49 / 3 / 348 | 1.744 | 0,23 % |
| 35-49 / 4 / 263 | 1.738 | 8,34 % |
| 65+ / 3 / 65 | 1.708 | 10,30 % |
| 35-49 / 2 / 290 | 1.700 | 2,41 % |
| 35-49 / 1 / 68 | 1.653 | 10,34 % |

## 4. Sensibilidad: ranking por cobertura con y sin el supuesto

| Territorio | Posición sin | Cobertura sin (x1000) | Posición con | Cobertura con (x1000) | ¿Cambia? |
|---|---|---|---|---|---|
| La América | 1 | 222,12 | 1 | 222,12 | no |
| Robledo | 2 | 208,64 | 2 | 208,64 | no |
| Buenos Aires | 3 | 198,63 | 3 | 198,63 | no |
| Guayabal | 4 | 186,41 | 4 | 186,41 | no |
| Belén | 5 | 182,20 | 5 | 182,20 | no |
| Popular | 6 | 175,49 | 7 | 175,49 | sí |
| Castilla | 7 | 174,95 | 8 | 174,95 | sí |
| Manrique | 8 | 168,27 | 9 | 168,27 | sí |
| San Javier | 9 | 146,17 | 10 | 146,17 | sí |
| La Candelaria | 10 | 141,18 | 6 | 178,82 | sí |
| Aranjuez | 11 | 126,38 | 11 | 126,38 | no |
| Laureles - Estadio | 12 | 115,72 | 12 | 115,72 | no |
| Villa Hermosa | 13 | 111,28 | 13 | 111,28 | no |
| Santa Cruz | 14 | 108,49 | 14 | 108,49 | no |
| Doce de Octubre | 15 | 80,01 | 15 | 80,01 | no |
| El Poblado | 16 | 55,21 | 16 | 55,21 | no |
| Altavista | -- | -- | -- | -- | no |
| Palmitas | -- | -- | -- | -- | no |
| San Antonio de Prado | -- | 82,99 | -- | 82,99 | no |
| San Cristóbal | -- | 36,46 | -- | 36,46 | no |
| Santa Elena | -- | 73,12 | -- | 73,12 | no |

Territorios que cambian de posición: Popular, Castilla, Manrique, San Javier, La Candelaria.

**Nota:** La Candelaria depende del supuesto no verificable `CENTRO → LA CANDELARIA`: puesto 10 (141,18) sin él y puesto 6 (178,82) con él.

## 5. Círculos solidarios por método

Filas sin barrio, no mapeables: 34.489.

| Método | Filas |
|---|---|
| comuna_codigo | 21.015 |
| sin_mapeo | 16.215 |
| barrio_hacinamiento | 13.541 |
| comuna_exacta | 5.602 |
| prefijo_comuna | 517 |
| alias_verificado | 370 |
| ambiguo | 28 |

## 6. Notas y límites

- `saldos` solo cubre los créditos con cortes en su ventana. La mora se calcula sobre 1.043.695 registros crédito-corte.
- 5 registros con `DIAS_MORA` nulo quedan fuera de la mora (el pipeline convierte 999 en nulo).
- `hogares_sisben_2009_2020` suma `Sin Hacinamiento` y `Con Hacinamiento` de todos los años de la base Sisbén; `pct_hacinamiento_sisben_2009_2020` es 100 × `Con Hacinamiento` / ese total.
- El 2020 por sí solo trae entre menos de 10 y 1.349 registros por territorio, insuficiente para un porcentaje estable; por eso se acumulan 2009-2020. La unidad del archivo no está declarada y un hogar puede repetirse entre años.
- La cobertura compara clientes actuales con población proyectada a 2020.
- Oficinas por 100.000 habitantes: corte 2026-06-30 sobre población 2020.
- Confidencialidad: todo conteo menor que 10 (incluido 0) pasa a NULL con `dato_suprimido=true`; cada cobertura o porcentaje se anula si se suprime el conteo del que depende. Territorios afectados (5): Altavista (clientes_jfk, clientes_jfk_con_supuestos, clientes_con_saldos, clientes_con_credito); Palmitas (clientes_jfk, clientes_jfk_con_supuestos, clientes_con_saldos, clientes_con_credito, circulos_2016_2019); El Poblado (circulos_2016_2019); San Antonio de Prado (circulos_2016_2019); Santa Elena (circulos_2016_2019).
- Los totales del informe permiten deducir la suma de los territorios suprimidos. En clientes y círculos esa suma es 0: ningún registro quedó asignado a esos territorios, lo que no prueba ausencia real.
- Control del guion: el pipeline parte `COMUNA_BARRIO` por `-`, así que un nombre con guion puede quedar con un fragmento como municipio. Municipios que coinciden con esos fragmentos (10 o más clientes): ninguno.

## 7. Comprobaciones

| Comprobación | Resultado |
|---|---|
| Clientes: 356.014 en territorios + 928 ambiguo + 18.696 sin_mapeo + 45.411 sin_informacion = 421.049 (esperado 421.049) | OK |
| Población: suma de los 21 = 2.569.007; Total Medellín = 2.569.007 | OK |
| Estandarización: observados 91.256 y esperados 91.256,00 coinciden | OK |
| Último corte de datos.gov.co: 2026-06-30 (esperado 2026-06-30) | OK |
| Ningún ID en las salidas: 0 columnas de ID y 0 valores de ID en 8 archivos parquet y el informe | OK |
| Checksum idéntico a la corrida anterior (445aa3ee440f8690198c5d66b6906877819ce6ed65f4fdb534b8c923c49da26b) | OK |
