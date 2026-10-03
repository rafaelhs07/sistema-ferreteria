# Verificación y aceptación

Entorno de ejecución: Windows, Node.js 24.18.0, npm 11.16.0, Chrome instalado, Next.js 16.3.8 y PostgreSQL/Supabase. Las versiones concretas están fijadas en package-lock.json. Las pruebas locales ejecutan las migraciones reales en PostgreSQL efímero mediante PGlite; solamente los protocolos de Auth/Storage se adaptan para el navegador.

## Matriz de reglas críticas

| Criterio | Resultado y evidencia |
| --- | --- |
| Dos negocios aislados y acceso directo | RLS y funciones privadas probadas con rol authenticated y usuarios distintos en tests/database.sql. |
| Acciones por rol | VENDEDOR no ajusta inventario, no puede escribir pertenencias directamente ni leer costos/pagos de proveedores. |
| Caja de 100 tornillos, venta 15 | Recepción 40 + 60; stock 100; venta 15; disponible 85. SQL y navegador. |
| Cantidades decimales | Venta de 1.25 metros; saldo físico 3.75. SQL. |
| Última unidad simultánea | Dos transacciones reales concurrentes en Supabase: una venta y cobro, otra rechazada, stock final cero. Scripts tests/concurrency. |
| Pagos combinados | Efectivo + banco; dos movimientos y una sola venta. SQL. |
| Crédito y abono | Abono reduce deuda, no aumenta el número de ventas. SQL y navegador. |
| Recepción parcial | Orden no aumenta stock; recepciones parciales sí, sin superar lo pendiente. SQL y navegador. |
| Devolución parcial | Repone o marca daño; ajusta deuda y reembolso; rechaza exceso. SQL y navegador. |
| Entrega posterior | Despacho parcial conserva el stock previamente descontado. SQL y navegador. |
| Caja y diferencia | Fondo, esperado, conteo y motivo; segundo cierre rechazado. SQL y navegador. |
| Recurrencia | Generar dos veces no duplica obligaciones; ninguna queda pagada automáticamente; se puede pausar. SQL. |
| Reintento de venta | Mismo UUID/contenido devuelve el resultado original sin otro movimiento. SQL. |
| Margen histórico | Cambiar promedio con otra entrada no modifica costo guardado en la venta. SQL. |
| Reporte consistente | Margen sin impuestos, pérdida en devolución dañada, reversión de anulación, aportes/transferencias fuera de utilidad. SQL. |

También se comprobó reserva explícita, liberación al rechazo, conversión única a venta, numeración por negocio/tipo, recibos con aplicaciones, inventario valorizado protegido y reportes por autor.

## Navegador

Playwright en Chrome completó creación de negocio, producto, presentación de 100, fotografía optimizada, proveedor y cliente; apertura; orden, confirmación y recepción; venta al contado; venta a crédito; abono; entrega parcial; devolución; garantía, actualización del caso y recibo; PDF e impresión; cierre de caja.

Se capturan dashboard y POS a 360, 390, 768, 1024 y 1440 px, comprobando que la página no desborde horizontalmente. Se inspeccionaron las imágenes y los formatos A4/80 mm; se comprobó el ancho del PDF térmico y que incluye el cliente. Se guardó un borrador y se bloqueó una confirmación sin conexión sin perderlo. No hubo errores JavaScript ni de consola. El total móvil permanece accesible y las tablas tienen tarjetas con rótulos por celda. Los diálogos nativos controlan foco y teclado. Esto no equivale a una certificación WCAG ni a probar hardware físico.

La autenticación del navegador de prueba usa una cuenta **local, efímera y claramente identificada**. El adaptador no carga .env.local ni llama al proyecto remoto. Las operaciones no están simuladas: ejecutan el SQL real, permisos y RLS. No se agregaron datos de demostración a la aplicación de producción.

## Comprobaciones remotas

Las ocho migraciones se aplicaron al proyecto `ucuqswghcbobpqdsnfot` y se sincronizaron sus versiones locales con el historial remoto. La aceptación SQL pasó dentro de BEGIN/ROLLBACK. La prueba de simultaneidad usó un negocio con nombre `__QA_TEMPORAL_SIMULTANEIDAD__`, que se eliminó después con protección por UUID y nombre. Se verificó que no quedaran usuarios, negocios ni documentos de prueba.

Se comprobaron activos los trabajos pg_cron de obligaciones diarias y liberación de reservas. El asesor de seguridad devolvió cero avisos. Los índices duplicados y una FK privada sin índice detectados por el asesor de rendimiento se corrigieron en una migración; los índices aún no usados son esperables en una base sin operaciones y no se eliminaron por ese aviso.

## Comandos reproducibles

Además de Windows, [GitHub Actions en Ubuntu](https://github.com/rafaelhs07/sistema-ferreteria/actions/runs/37157121867) completó instalación limpia, tipos, lint, cuatro pruebas unitarias, aceptación PostgreSQL, compilación y prueba integral de Chrome con resultado satisfactorio para el commit `26a39c3`.

```bat
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm run build
npm audit --omit=dev
```

Las capturas, trazas y el reporte HTML del navegador se generan en `test-results` y `playwright-report`, excluidos de Git. No ejecutes fixtures de concurrencia sobre un negocio real; usa un entorno aislado y la limpieza guardada únicamente para su fixture identificado.

La instalación de la PWA en dispositivos, SMTP real, impresión Bluetooth y simulacro de restauración real siguen sin verificarse; consulta LIMITACIONES.md.
