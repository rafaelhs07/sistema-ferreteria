# Ferro · Sistema de ferretería

Aplicación en español para productos, presentaciones, compras, inventario, ventas, créditos, caja, gastos, devoluciones, entregas y reportes. Next.js App Router, TypeScript estricto, React, Tailwind CSS y Supabase.

**Estado:** implementación funcional con verificaciones de entrega completadas. No constituye facturación fiscal ni contabilidad certificada. Consulta [avance](docs/AVANCE.md), [verificaciones](docs/VERIFICACION.md) y [limitaciones](docs/LIMITACIONES.md) antes de operar con información real.

## Ejecutar en Windows CMD

Probado con Node.js 24.18.0 y npm 11.16.0. Instala Node.js y Git, abre CMD y ejecuta:

```bat
git clone https://github.com/rafaelhs07/sistema-ferreteria.git
cd sistema-ferreteria
npm ci
copy .env.example .env.local
notepad .env.local
```

Completa únicamente la URL de tu proyecto Supabase y su clave publicable. Guarda el archivo y ejecuta:

```bat
npm run dev
```

Abre [localhost:3000](http://localhost:3000). Las pruebas no requieren secretos del proyecto remoto. Las claves de servidor nunca deben comenzar con `NEXT_PUBLIC_` ni subirse a Git.

```bat
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm run build
npm start
```

El navegador automatizado usa Chrome instalado en Windows. Las pruebas web escuchan exclusivamente en 127.0.0.1:3100 y 127.0.0.1:54329. No ejecutan operaciones en el Supabase remoto.

## Conectar Supabase

El proyecto conectado durante esta implementación es `sistema-ferreteria`, referencia `ucuqswghcbobpqdsnfot`. Las migraciones aplicadas están en `supabase/migrations` y su historial local coincide con el remoto. No vuelvas a ejecutar manualmente las migraciones ya aplicadas.

Para un proyecto nuevo o futuros cambios:

```bat
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Revisa el proyecto seleccionado antes del último comando. Para desarrollo completamente local, instala Docker Desktop y usa `npx supabase start` y `npx supabase db reset` **solo en el entorno local de pruebas**. `db reset` elimina sus datos locales.

Auth debe mantener la confirmación de correo. Configura Site URL y URLs de redirección, incluyendo `http://localhost:3000/auth/callback` durante desarrollo y la URL HTTPS equivalente al publicar. Configura SMTP propio para la entrega de correo de producción.

El bucket privado `business-files` y sus políticas se crean con las migraciones. No marques ese bucket como público. El esquema `private` debe permanecer fuera de los esquemas expuestos por la Data API.

## Crear el primer administrador

1. En la aplicación, pulsa **Crear cuenta** y usa el correo real del propietario.
2. Confirma el correo y luego inicia sesión.
3. Escribe el nombre del negocio y pulsa **Crear mi negocio**.
4. La base de datos crea la pertenencia ADMIN para esa cuenta, una sucursal, una bodega, una caja, una cuenta bancaria y un medio de tarjeta. No añade inventario, ventas ni fondos ficticios.
5. Configura moneda, zona horaria, datos del negocio, impuestos por producto, cuentas y políticas antes de la primera operación.

Si la entrega de correo aún no está configurada, un operador del proyecto puede crear la cuenta en Supabase Auth desde el Dashboard. Usa una contraseña elegida por el propietario y no la publiques en scripts ni documentación. No desactives RLS ni concedas ADMIN editando datos desde el navegador.

Para incorporar a otra persona, primero debe crear y confirmar su cuenta; luego ADMIN le asigna acceso por correo o UUID desde **Configuración → Usuarios y permisos**. Puede pertenecer a varios negocios, con roles distintos.

SUPER_ADMIN se provisiona exclusivamente por el propietario de la base, después de confirmar el UUID de su cuenta:

```sql
insert into private.platform_admins(user_id)
select id from auth.users where id = 'UUID_VERIFICADO_DEL_OPERADOR'::uuid;
```

No existe una ruta pública para conceder ese privilegio. Su panel permite controlar estados de acceso, suscripciones y cobros del servicio; no concede automáticamente lectura de información comercial de otros negocios.

## Publicar

Puede ejecutarse en un proveedor compatible con Next.js o en un servidor Node. No funciona como exportación HTML estática: Auth, API, impresión y operaciones requieren servidor.

Configura las dos variables públicas de `.env.example` en el entorno del proveedor, instala con `npm ci`, compila con `npm run build` y arranca con `npm start`. Usa HTTPS, configura las redirecciones de Auth para ese dominio y no publiques `.env.local`. No se necesita una clave secreta para servir la aplicación.

La primera versión necesita conexión. La PWA instala la interfaz y usa borradores por usuario, negocio y sucursal; no confirma ventas sin internet ni guarda datos privados en caché del service worker.

## Documentación

- [Reglas de operación y seguridad](docs/REGLAS.md).
- [Verificaciones y aceptación](docs/VERIFICACION.md).
- [Respaldos y restauración, incluidos los archivos](docs/RECUPERACION.md).
- [Limitaciones y configuración pendiente](docs/LIMITACIONES.md).
- [Avance para continuar el trabajo](docs/AVANCE.md).

Documentación tecnológica revisada: [Next.js](https://nextjs.org/docs/app), [SSR de Supabase](https://supabase.com/docs/guides/auth/server-side), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage privado](https://supabase.com/docs/guides/storage/security/access-control), [pg_cron](https://supabase.com/docs/guides/cron) y [Tailwind con Next.js](https://tailwindcss.com/docs/guides/nextjs). Next.js también incluye guías de la versión instalada en `node_modules/next/dist/docs`.
