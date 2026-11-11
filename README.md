# DARVIS

DARVIS es un tablero interactivo con asistente de chat. Cruza la cartera anonimizada de la
Cooperativa JFK con datos abiertos de Medellín, por comuna, y responde con gráficos que se pueden
mover, ampliar y ordenar.

Equipo DataBrothers · En línea: https://darvis-two.vercel.app/ · Contacto: Camilo Rafael Pérez
Chaves (camiloperez1147286@correo.itm.edu.co)

## Pregunta

¿En qué comunas de Medellín hay espacio para ampliar la presencia de JFK y llegar a personas con
más necesidad, donde los clientes actuales de JFK no se atrasan en sus pagos más de lo esperado?

## Hallazgo

- De 16 comunas comparables, 2 cumplen las tres condiciones: Doce de Octubre y Villa Hermosa.
- Las dos tienen menos clientes de JFK por habitante que la comuna mediana y más hacinamiento.
- Para llegar a la cobertura mediana harían falta 21.584 clientes más: 15.154 en Doce de Octubre
  y 6.430 en Villa Hermosa.
- La razón entre la mora observada y la esperada es 0,922 en Doce de Octubre y 0,915 en Villa
  Hermosa. El intervalo de confianza incluye 1, así que la conclusión es "sin evidencia de más
  mora de la esperada", no que "paguen mejor".
- Las candidatas son las mismas si la necesidad se mide con el Índice Multidimensional de Calidad
  de Vida de 2018 en lugar del hacinamiento.

## Fuentes

Cartera anonimizada de la Cooperativa JFK; MEData (hacinamiento Sisbén, proyecciones de población
2020 e Índice Multidimensional de Calidad de Vida); datos.gov.co (Superfinanciera: oficinas y
cartera en Medellín).

## Cómo ejecutarlo

Ver `instrucciones.txt`.
