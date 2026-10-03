import { serverClient } from '@/lib/supabase/server';
import { PrintControls } from '@/components/print-controls';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/types';
export const dynamic = 'force-dynamic';
async function load(business: string, id: string) {
  const db = await serverClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return null;
  const [{ data: workspace, error: w }, { data: result, error: r }] = await Promise.all([
    db.rpc('workspace', { p_business: business }),
    db.rpc('read_data', { p_business: business, p_entity: 'payments', p_filters: { id } }),
  ]);
  if (w || r || !result?.rows?.length) return null;
  return { business: workspace.settings as Row, payment: result.rows[0] as Row };
}
export default async function Receipt({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ business?: string }>;
}) {
  const { id } = await params;
  const { business } = await searchParams;
  const result = business ? await load(business, id).catch(() => null) : null;
  if (!result)
    return (
      <main className="setup">
        <h1>Recibo no disponible</h1>
        <p>Comprueba tu sesión y permisos.</p>
      </main>
    );
  const b = result.business,
    p = result.payment;
  const money = (v: unknown) => formatMoney(String(v || 0), String(b.currency));
  return (
    <main className="print-document">
      <PrintControls />
      <article>
        <h1>{String(b.name)}</h1>
        <p>
          {String(b.tax_id)} · {String(b.phone)}
        </p>
        <h2>Recibo de {p.direction === 'in' ? 'cobro' : 'pago'}</h2>
        <p>Referencia única: {String(p.id)}</p>
        <p>
          {new Date(String(p.created_at)).toLocaleString('es-NI', { timeZone: String(b.timezone) })}
        </p>
        <p>{String(p.party_name || 'Consumidor final')}</p>
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Aplicado</th>
            </tr>
          </thead>
          <tbody>
            {((p.applications || []) as Row[]).map((a) => (
              <tr key={String(a.document_id)}>
                <td>
                  #{String(a.number_prefix || '')}
                  {String(a.number)}
                </td>
                <td>{money(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Total: {money(p.amount)}</h2>
        <p>{String(p.reference || '')}</p>
        <p>
          Este recibo acredita un movimiento de dinero. El saldo se calcula desde los pagos,
          devoluciones y documentos originales.
        </p>
      </article>
    </main>
  );
}
