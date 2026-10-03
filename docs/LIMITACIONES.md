# Límites y configuración pendiente

- **Facturación:** los documentos y PDF son comerciales. No hay certificación fiscal, firma electrónica ni conexión con una autoridad tributaria.
- **Publicación:** el código puede ejecutarse localmente y la base está conectada. No se ha contratado ni configurado un dominio/proveedor público en esta entrega.
- **Correo:** se usa Supabase Auth real. El propietario debe confirmar la primera cuenta y configurar URLs/SMTP para el dominio publicado. No se ha probado la recepción de un correo real del propietario.
- **Suscripciones:** SUPER_ADMIN registra planes, estados e importes cobrados por el servicio. No hay pasarela, domiciliación bancaria ni cobro automático. La suspensión es una acción explícita.
- **Empleados:** se pueden registrar salarios, frecuencia y obligaciones programadas. Las comisiones son de referencia para liquidación manual; no se habilita una nómina fiscal ni cálculo automático de comisiones.
- **Impresoras:** HTML imprimible y PDF A4/80 mm. No se validaron impresoras térmicas, Bluetooth, corte de papel ni permisos de impresión en iOS/Android reales. La impresión depende del navegador y controlador del equipo.
- **PWA/cámara:** se revisó el manifiesto y la interfaz en Chrome; falta comprobar instalación en dispositivos físicos. La lectura de cámara usa BarcodeDetector cuando está disponible; la entrada manual y lectores tipo teclado sirven como alternativa.
- **Offline:** conservar borradores en la sesión está permitido. Confirmar ventas, cobros, recepciones y ajustes exige conexión; no hay sincronización offline.
- **Contabilidad:** resultado operativo estimado, sin libro mayor, depreciación, conciliación bancaria automática, impuestos recuperables ni conversión de moneda. Configura la moneda antes de operar; cambiar su símbolo no convierte importes históricos.
- **Costeo adicional:** gastos adicionales de compras se prorratean por unidades base del pedido. Si necesitas distribución por valor, peso o volumen, la política debe ampliarse antes de usar ese método. Transporte de venta y su gasto se registran por separado.
- **Importación:** CSV/XLSX admite columnas de catálogo indicadas en la vista previa, hasta 1000 filas y 5 MB, sin fórmulas ni enlaces. No migra documentos, stock histórico, fotografías ni clientes desde otra aplicación. No sobrescribe productos duplicados.
- **Archivos:** una fotografía principal por producto y comprobantes PDF/imágenes privados. La firma, decodificación y tamaño se validan; no se integra un servicio antivirus externo.
- **Recuperación:** no se verificó el plan de backups automáticos ni se realizó una restauración completa del proyecto real. Hay procedimiento y herramienta para base y archivos; falta el simulacro con credenciales de operador.
- **Dependencias:** `npm audit --omit=dev` reportó cero vulnerabilidades. La auditoría completa detectó cinco avisos altos en una misma cadena de herramientas de lint (braces → micromatch → fast-glob → plugin/config Next). No existe arreglo compatible instalado; npm propone bajar ESLint Config de Next a 14, incompatible con esta versión. No se realizó ese downgrade. [Aviso del proveedor](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Las pruebas web usan autenticación de protocolo exclusiva de pruebas sobre PostgreSQL efímero con las migraciones reales. Las reglas y RLS también se probaron en Supabase real, dentro de transacciones revertidas. Esto no reemplaza probar SMTP, dispositivos o una restauración real.
