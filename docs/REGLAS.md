# Reglas de operación

## Datos y autorización

Negocio, sucursal, bodega, cuenta y usuario son entidades separadas. Las referencias comerciales incluyen negocio + UUID para impedir relaciones entre negocios. Catálogos de unidades, categorías y marcas se relacionan por negocio y nombre. Una variante es otro SKU, con producto principal opcional y atributos de medida, color y capacidad.

Las tablas comerciales tienen RLS y permisos de lectura específicos. Los usuarios ordinarios no tienen INSERT/UPDATE/DELETE directo sobre datos comerciales; las escrituras pasan por `public.command`, que valida pertenencia, rol, permiso, estado del negocio y reglas transaccionales. Los helpers privilegiados están en el esquema privado, con `search_path` explícito y EXECUTE restringido. Las APIs usan la identidad del usuario, no una clave que omita RLS.

ADMIN controla su negocio. VENDEDOR vende y cotiza; CAJERO cobra y maneja caja; BODEGUERO recibe, ajusta y entrega; CONTADOR accede a los costos y resultados de su negocio; CONSULTA tiene lectura limitada. Los permisos adicionales habilitan acciones concretas. Los costos se protegen también en consultas directas y RPC; ocultar un botón no sustituye autorización.

Las cookies de sesión son HttpOnly, SameSite=Lax y Secure en producción. El cliente llama APIs del mismo sitio; no contiene un cliente Supabase con acceso directo a secretos. Se comprueba Origin en escrituras. Auditoría e idempotencia están protegidas contra modificaciones ordinarias.

## Dinero y cantidades

Dinero: NUMERIC(18,2). Cantidades, factores y costo unitario promedio: NUMERIC(18,6). Se rechazan NaN y cantidades inválidas. El subtotal de cada línea es cantidad × precio − descuento, redondeado a centavos; el impuesto se redondea por línea. El total incluye transporte y, en compras, costos adicionales. Decimal.js replica el cálculo orientativo; PostgreSQL decide el importe final.

`private.price_line` es la fuente común de la vista previa y confirmación. Verifica producto/presentación activos, cantidades, precio público o mayorista, precio por cliente/cantidad, cambios de precio autorizados y límites de descuento. El navegador no puede imponer su total o permiso.

Cada documento conserva nombres, presentación, factor, precio, descuento, impuesto y costo de su momento. Editar el catálogo no recalcula documentos existentes. La numeración se controla por negocio y tipo; los prefijos son una instantánea y el siguiente número debe superar los existentes.

## Inventario y compras

- Físico: mercadería vendible en la bodega.
- Reservado: parte del físico retenida explícitamente por cotizaciones vigentes.
- Disponible: físico − reservado.
- Dañado: existencias separadas, excluidas de la disponibilidad vendible.

Una orden de compra no modifica existencias. Confirmarla registra la obligación; recibir incorpora las cantidades realmente recibidas y permite recepciones parciales. La recepción de una caja con factor 100 añade 100 unidades base; vender 15 deja 85.

El costo promedio ponderado se mantiene por producto y bodega: `(cantidad anterior × promedio anterior + entrada × costo de entrada) / cantidad nueva`. Una venta conserva su propio costo unitario. Los costos adicionales de compra se distribuyen por las unidades base del pedido, y cada recepción incorpora la fracción correspondiente. Los impuestos de compra se consideran parte del costo; no existe recuperación fiscal de IVA. El transporte de venta es ingreso accesorio; registra su gasto asociado por separado cuando corresponda.

Se bloquean las existencias por producto/bodega para evitar vender simultáneamente la última unidad. Se ordenan las operaciones con varios productos para limitar interbloqueos. La transacción completa se revierte si una línea, pago o validación falla.

Un traslado descuenta al salir y conserva el costo de ese momento; la recepción añade al destino una sola vez. Los conteos generan la diferencia como un movimiento con motivo. Los ajustes negativos registran pérdidas o salidas; los positivos necesitan un costo autorizado o usan el promedio existente. El kardex conserva origen, usuario y fecha.

## Ventas, créditos y pagos

Confirmar una venta guarda documento, detalles, costo, inventario, pagos y deuda en una transacción. Los pagos combinados pueden repartir el cobro entre efectivo, banco y tarjeta. El efectivo recibido puede exceder el total; el cambio reduce lo aplicado a la venta y lo registrado en caja. No se aplica cambio a una transferencia o tarjeta.

La comisión de tarjeta es un movimiento y gasto aparte: el cliente sigue habiendo pagado el importe bruto. La venta a crédito exige cliente y valida saldo, límite y vencimiento. Las ventas concurrentes de un cliente serializan la comprobación de crédito.

Un abono registra un pago y sus aplicaciones a uno o varios documentos del mismo cliente/proveedor y sucursal. No crea ventas. Los reembolsos se generan desde devoluciones o anulaciones autorizadas; no pueden disfrazarse como abonos ordinarios en sentido contrario.

El saldo se calcula desde el documento, aplicaciones de pagos y devoluciones, no desde un número editable. Una devolución reduce primero la deuda; solo el excedente se devuelve por una cuenta. Nunca puede exceder lo vendido o recibido. Los daños no vuelven a vendibles. Una venta de cambio se relaciona con la venta original y se confirma como operación nueva, después de la devolución.

Las ventas confirmadas no se borran. La anulación exige motivo y permiso, repone existencias y devuelve lo cobrado. Si ya hay devoluciones o constancias de entregas, se usa devolución para evitar una reversión contradictoria. Las sesiones cerradas no reciben movimientos nuevos ni cambian su cierre silenciosamente.

## Cotizaciones y entregas

Cotizar no reserva. Una reserva exige cantidad, bodega y vencimiento. Se libera al vencer, rechazar o convertir la cotización; la tarea de servidor revisa cada cinco minutos. Una cotización vencida pasa a estado vencida sin depender de abrir la aplicación. Solo puede originar una venta activa.

La venta descuenta al confirmar, incluso para entrega posterior. El despacho solo registra cantidad, responsable/recibidor y constancia: nunca descuenta una segunda vez. Se admite entrega parcial y se calcula pendiente = vendido − entregado − devuelto. La constancia adjunta es privada. Garantías conserva serie, estado y seguimiento vinculado a la línea original.

## Caja, gastos y programación

La apertura guarda el fondo realmente contado. El esperado al cerrar es fondo + movimientos del turno; el conteo real y motivo de diferencia se conservan. Bancos y tarjetas muestran el neto de movimientos registrados; parten de cero y admiten aportes identificados. Una transferencia propia genera dos movimientos opuestos y no crea utilidad.

Registrar un gasto crea una obligación; pagarlo genera la salida de dinero. Los gastos programados son semanales cada 7 días, quincenales cada 14 días, o mensuales en el día inicial, usando el último día en meses cortos. Se ejecutan diariamente con pg_cron a las 06:05 UTC, calculando la fecha local del negocio. Negocios suspendidos no generan obligaciones nuevas durante la suspensión; al reactivar se recuperan las fechas vencidas.

La combinación regla + fecha es única. Se puede pausar una regla sin borrar gastos ya generados. Programar un salario no paga al empleado: crea obligaciones de nómina que se pagan por separado. Las comisiones de empleados son referencias para cálculo manual; no se genera una liquidación automática.

## Reportes

Las fechas se interpretan en la zona horaria del negocio. Ventas y cobros son conceptos distintos; egresos y gastos tampoco son equivalentes. Las compras de inventario no se descuentan otra vez como gastos operativos.

- Ventas netas: ventas confirmadas, transporte e impuestos, menos devoluciones y anulaciones de su período.
- Margen bruto: ventas netas sin impuestos − costo vendido histórico. Una devolución vendible revierte su costo; una dañada conserva el costo como pérdida.
- Resultado estimado: margen bruto − obligaciones de gasto del período − comisiones de tarjeta.
- Cobros: pagos de clientes recibidos menos reembolsos.
- Egresos: salidas de dinero excluyendo transferencias propias. Los aportes no son ventas ni utilidad.
- Deuda, caja y valorización: estado actual al consultar; la antigüedad usa la fecha local actual.

El filtro de usuario usa autor del documento para ventas/costos y autor del movimiento para pagos/gastos/cierres. Existencias y valorización pertenecen a la sucursal. El ranking muestra ventas del período netas de devoluciones registradas hasta su último día. Los resultados no son estados fiscales, y no incluyen depreciación, ajuste cambiario ni una contabilidad completa de pérdidas extraordinarias.

## Reintentos y archivos

Cada comando tiene UUID de solicitud, negocio, usuario y huella de contenido. Repetir la misma solicitud devuelve el resultado guardado; cambiar su contenido exige otro UUID. El POS conserva ese UUID al recuperar un borrador y borra el borrador al confirmar. Los borradores se separan por usuario, negocio, sucursal y tipo; se limpian al salir o cambiar de negocio.

Fotos y comprobantes se guardan en un bucket privado con rutas por negocio. Se limita a 5 MB y se inspecciona la firma del archivo. Las fotografías se decodifican, orientan, reducen a 1200 px y convierten a WebP. Los enlaces de lectura son firmados por 60 segundos y pasan por la identidad del usuario. El service worker no tiene manejador de fetch ni caché de documentos, ventas o credenciales.
