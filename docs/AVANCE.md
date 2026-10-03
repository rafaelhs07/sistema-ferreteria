# Avance — sistema de ferretería

Estado: implementación y revisión de entrega completadas el 3 de octubre de 2026. Aplicación funcional conectada a Supabase, preparada para ejecutar y desplegar. No certificada fiscalmente; no hay sitio público desplegado.

## Inspección inicial

- GitHub rafaelhs07/sistema-ferreteria: vacío, clonado en la carpeta autorizada.
- No había AGENTS.md ni implementación anterior. Next.js generó después sus instrucciones, que se conservaron.
- Supabase `ucuqswghcbobpqdsnfot`: proyecto sistema-ferreteria activo, esquema público vacío.
- Documentación consultada: Next.js instalación/App Router; Tailwind integración Next; Supabase SSR/Auth, RLS y changelog del 2026-10-03.
- PostgreSQL 17.11: no se utilizan operadores/extensiones afectados por la actualización de septiembre.

## Etapas

1. Implementado: arquitectura, identidad SSR, negocios, permisos, RLS y sistema visual.
2. Implementado: catálogo, presentaciones, variantes, compras con recepciones parciales, inventario, kardex, conteos y traslados.
3. Implementado y probado: ventas, pagos combinados, créditos, abonos, recibos y sesiones de caja.
4. Implementado: gastos recurrentes con pg_cron, devoluciones, entregas sin doble stock, garantías y reportes.
5. Implementado y revisado: administración, facturación administrativa del servicio, PWA, adjuntos, impresión y documentación.

## Comprobaciones realizadas

- TypeScript estricto, lint sin advertencias y build de Next.js: pasaron en la revisión final.
- Cuatro pruebas unitarias y pruebas PostgreSQL/PGlite con migraciones reales: pasaron.
- Aislamiento y permisos, caja 100 tornillos → venta 15 → 85 disponibles, decimales, pagos combinados, crédito y abono, recepción parcial, devolución, entrega, diferencias de caja, recurrencia sin duplicados, reintento idempotente y margen histórico: comprobados.
- SQL de aceptación también pasó en Supabase dentro de BEGIN/ROLLBACK, sin conservar fixtures.
- Dos conexiones simultáneas contra Supabase intentaron vender la última unidad: una venta, un cobro, stock cero; el segundo vendedor recibió existencias insuficientes. Fixture eliminado con verificación posterior.
- Playwright en Chrome completó compra, venta, crédito, abono, devolución, entrega, adjunto, garantía, recibo, impresión A4/80 mm, PDF y cierre. Conservó un borrador y bloqueó confirmar sin conexión. Revisó dashboard y POS en 360, 390, 768, 1024 y 1440 px sin desbordamiento de la página ni errores JS/consola. Última ejecución: 1 prueba integral aprobada en 23 segundos, código 0.
- Ocho migraciones aplicadas y sincronizadas con el historial remoto. Asesor de seguridad sin avisos; corregidos índices duplicados y FK privada sin índice.
- Auditoría de dependencias de producción: cero vulnerabilidades. Los cinco avisos de herramientas de desarrollo están documentados en LIMITACIONES.md.
- pg_cron: dos trabajos activos verificados en Supabase. Proyecto remoto sin usuarios ni datos comerciales al último control.

## Siguientes pasos de puesta en operación

1. Crear y confirmar la primera cuenta real del propietario según README.md.
2. Configurar datos comerciales, productos, inventario inicial, cuentas y permisos.
3. Seleccionar proveedor/dominio, desplegar con HTTPS y configurar URLs de Auth y SMTP.
4. Realizar un simulacro de restauración en un proyecto aislado y validar impresoras y dispositivos reales.

Código, documentación, migraciones y flujo de CI están preparados para GitHub. No se conservaron datos de pruebas en Supabase.

## Limitaciones conocidas al momento

- No hay integración fiscal/electrónica, pasarela para suscripciones ni validación con impresora Bluetooth real.
- La comisión de empleado se configura como referencia y se calcula manualmente; la obligación salarial sí puede programarse.
- No se ha comprobado un respaldo automático del plan de Supabase ni realizado un simulacro completo de restauración.
- Se necesita crear y confirmar la primera cuenta de Auth mediante la interfaz; no se inventaron credenciales de administrador.
- No hay despliegue público todavía. Las pruebas de navegador usan un adaptador de protocolo Auth sobre PostgreSQL efímero; no sustituyen una validación de entrega de correo en el entorno publicado.

## Decisiones

- Moneda C$ / código NIO; zona America/Managua según requerimiento.
- Dinero NUMERIC(18,2); cantidades y factores NUMERIC(18,6). Redondeo por línea a 2 decimales.
- Costeo promedio ponderado por producto y bodega. Snapshot por venta.
- Una venta descuenta existencias al confirmar, incluso con entrega posterior. Despachar solo registra entrega.
- Sin caché de datos privados ni confirmaciones fuera de línea. Borrador de venta por usuario en sessionStorage; se limpia al salir.
- Todas las escrituras comerciales se canalizan por funciones con autorización; las tablas de movimientos son de lectura para authenticated.
- Las claves publicables pueden estar en .env.local; ninguna clave secreta es necesaria para servir la aplicación.
