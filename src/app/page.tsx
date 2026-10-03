import { cookies } from 'next/headers';
import { configured, serverClient } from '@/lib/supabase/server';
import type { Context } from '@/lib/types';
import { AuthScreen, SetupScreen } from '@/components/auth-screen';
import { AppShell } from '@/components/app-shell';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!configured()) return <AuthScreen configured={false} />;
  const db = await serverClient();
  const { data: identity } = await db.auth.getUser();
  if (!identity.user) return <AuthScreen configured />;
  const { data, error } = await db.rpc('context');
  if (error)
    return (
      <main className="setup">
        <h1>No se pudo cargar tu negocio</h1>
        <p>Comprueba la conexión y que las migraciones estén aplicadas.</p>
        <Link className="button" href="/">
          Volver a intentar
        </Link>
      </main>
    );
  const businesses = data.businesses as Context['businesses'];
  if (!businesses.length && !data.superadmin)
    return <SetupScreen email={identity.user.email || ''} />;
  const chosen = (await cookies()).get('business')?.value;
  const business = businesses.find((b) => b.id === chosen) || businesses[0] || null;
  let workspace = {
    branches: [],
    warehouses: [],
    accounts: [],
    permissions: [],
    settings: {},
  };
  if (business?.status === 'active') {
    const { data: details, error: detailsError } = await db.rpc('workspace', {
      p_business: business.id,
    });
    if (detailsError)
      return (
        <main className="setup">
          <h1>No se pudo cargar la información</h1>
          <Link href="/" className="button">
            Volver a intentar
          </Link>
        </main>
      );
    workspace = details;
  }
  const ctx: Context = {
    user: { id: identity.user.id, email: identity.user.email || '' },
    businesses,
    business,
    ...workspace,
    superadmin: data.superadmin,
  };
  return <AppShell context={ctx} settings={workspace.settings} />;
}
