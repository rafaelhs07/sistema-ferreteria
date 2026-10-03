# Respaldos y restauración

No se ha comprobado que este proyecto tenga respaldos automáticos o recuperación a un instante activados. Verifica su plan y el panel Database → Backups antes de afirmar esa cobertura. La base de datos contiene metadatos de Storage; los archivos requieren copia separada. [Documentación de respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).

El procedimiento de operador combina base, historial de migraciones, archivos, configuración de Auth y tareas programadas. Guarda las copias cifradas, con acceso restringido y en una ubicación distinta del servidor. Las copias pueden contener cuentas, contactos, información financiera y contraseñas de Auth cifradas por el proveedor.

## Copia lógica de la base desde Windows CMD

Se necesitan Docker Desktop, Supabase CLI incluida en las dependencias y la cadena de conexión del **Session pooler** del proyecto correcto. Obtén sus datos en el panel Connect; no uses el pooler de transacciones para una restauración. No subas la cadena de conexión a Git ni captures su contraseña en registros compartidos.

```bat
set "FERRO_DB_URL=CADENA_DE_CONEXION_DEL_PROYECTO_ORIGEN"
mkdir C:\respaldos\ferro-2026-10-03
npx supabase db dump --db-url "%FERRO_DB_URL%" -f C:\respaldos\ferro-2026-10-03\roles.sql --role-only
npx supabase db dump --db-url "%FERRO_DB_URL%" -f C:\respaldos\ferro-2026-10-03\schema.sql
npx supabase db dump --db-url "%FERRO_DB_URL%" -f C:\respaldos\ferro-2026-10-03\data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
npx supabase db dump --db-url "%FERRO_DB_URL%" -f C:\respaldos\ferro-2026-10-03\history_schema.sql --schema supabase_migrations
npx supabase db dump --db-url "%FERRO_DB_URL%" -f C:\respaldos\ferro-2026-10-03\history_data.sql --use-copy --data-only --schema supabase_migrations
set "FERRO_DB_URL="
```

El dump de datos conserva Auth; verifica que incluye `auth.users`, identidades y las tablas comerciales/privadas. Conserva también una copia del código y de la configuración del proyecto: SMTP, URLs de Auth, dominios, extensiones y políticas personalizadas de Storage. El dump de esquema no sustituye las modificaciones específicas a los esquemas administrados. Las políticas `files_read` y `files_insert` están versionadas en las migraciones de este repositorio. [Procedimiento oficial de copia y restauración](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Copia de los archivos

La herramienta `scripts/storage-backup.mjs` usa una clave de operador, fuera del navegador y del repositorio. Recorre el bucket privado, pagina la lista, copia los bytes y guarda tamaño y SHA-256. Un manifiesto incompleto no puede restaurarse. El destino debe ser nuevo; la copia no pisa respaldos anteriores.

```bat
set "SUPABASE_URL=URL_DEL_PROYECTO_ORIGEN"
set "SUPABASE_SECRET_KEY=CLAVE_SECRETA_EXCLUSIVA_DEL_OPERADOR"
node scripts/storage-backup.mjs backup C:\respaldos\ferro-2026-10-03\storage
set "SUPABASE_SECRET_KEY="
set "SUPABASE_URL="
```

No se necesita esa clave para arrancar la aplicación. No la pongas en una variable `NEXT_PUBLIC_`. Si se interrumpe la copia, conserva el manifiesto incompleto para diagnóstico y usa otro directorio al repetir.

## Restaurar y comprobar

Haz el primer simulacro en **otro proyecto aislado**, sin usuarios comerciales. No restaures encima de producción sin una ventana de mantenimiento, respaldo comprobado y autorización del propietario. No ejecutes `db reset --linked` para intentar recuperar producción.

1. Crea el proyecto destino y habilita las extensiones necesarias, incluido pg_cron.
2. Comprueba versiones de PostgreSQL y del servicio. Revisa los dumps de roles y esquema para objetos administrados por Supabase que ya existen. Sigue las notas del procedimiento oficial para esos conflictos; detén la restauración ante errores no explicados.
3. Instala `psql` y restaura en una transacción, con parada ante errores:

```bat
set "FERRO_DEST_DB_URL=CADENA_VERIFICADA_DEL_PROYECTO_DESTINO"
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql --dbname "%FERRO_DEST_DB_URL%"
```

4. Restaura el historial de migraciones en el destino nuevo. No apliques otra vez las migraciones de creación sobre un esquema completo ya restaurado. Reconstituye las políticas personalizadas de Storage a partir de los archivos versionados, comparándolas antes de crearlas.
5. El bucket `business-files` debe ser privado, con límite de 5 MB y los tipos definidos por las migraciones. Cambia las variables del operador a la URL y clave del **destino**, y restaura los archivos. Si restauraste metadatos de objetos en la base, `--overwrite` es necesario para volver a escribir sus bytes:

```bat
set "SUPABASE_URL=URL_VERIFICADA_DEL_PROYECTO_DESTINO"
set "SUPABASE_SECRET_KEY=CLAVE_SECRETA_DEL_DESTINO"
node scripts/storage-backup.mjs restore C:\respaldos\ferro-2026-10-03\storage --overwrite
set "SUPABASE_SECRET_KEY="
set "SUPABASE_URL="
set "FERRO_DEST_DB_URL="
```

6. Reconecta Auth/SMTP y las redirecciones. Reactiva exactamente una instancia de los trabajos `ferro-recurring-expenses` y `ferro-release-reservations`, usando las sentencias idempotentes de la migración `scheduler`. Mantén inactivas las tareas durante la carga de datos.
7. Antes de cambiar el dominio o la aplicación al destino, compara cantidades por negocio, documentos, líneas, movimientos, aplicaciones y archivos. Comprueba físicamente varios hashes, fotografías y PDFs. Inicia sesión como usuario ordinario y verifica aislamiento, saldos, inventario, apertura/cierre y un reintento idempotente.

Registra fecha, origen, destino, cantidades, integridad, duración, responsable y resultado del simulacro. Esta entrega prepara el procedimiento y la herramienta; **no demuestra por sí sola que un respaldo del proyecto real pueda restaurarse**.
