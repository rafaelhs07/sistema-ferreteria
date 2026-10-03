import { serverClient } from '@/lib/supabase/server';
import { PrintControls } from '@/components/print-controls';
import { formatMoney } from '@/lib/money';
import Decimal from 'decimal.js';
import type { Row } from '@/lib/types';
export const dynamic = 'force-dynamic';
async function load(business: string, id: string, branch: string | null) {
  const db = await serverClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return null;
  const [{ data: workspace, error: w }, { data: contact, error: c }] = await Promise.all([
    db.rpc('workspace', { p_business: business }),
    db.rpc('read_data', { p_business: business, p_entity: 'parties', p_filters: { id } }),
  ]);
  if (w || c || !contact?.rows?.length) return null;
  const party = contact.rows[0] as Row;
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db.rpc('read_data', {
      p_business: business,
      p_entity: 'balances',
      p_page: page,
      p_filters: {
        party_id: id,
        kind: party.kind === 'customer' ? 'sale' : 'purchase',
        ...(branch ? { branch_id: branch } : {}),
      },
    });
    if (error) throw new Error('Estado no disponible');
    rows.push(...data.rows);
    if (page * 25 + 25 >= data.count) break;
  }
  return { business: workspace.settings as Row, party, rows };
}
export default async function Statement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ business?: string; branch?: string }>;
}) {
  const { id } = await params;
  const { business, branch } = await searchParams;
  const result = business ? await load(business, id, branch || null).catch(() => null) : null;
  if (!result)
    return (
      <main className="setup">
        <h1>Estado de cuenta no disponible</h1>
        <p>Comprueba tu sesión y permisos.</p>
      </main>
    );
  const b = result.business;
  const money = (v: unknown) => formatMoney(String(v || 0), String(b.currency));
  const balance = result.rows.reduce((sum, r) => sum.plus(String(r.balance || 0)), new Decimal(0));
  return (
    <main className="print-document">
      <PrintControls />
      <article>
        <h1>{String(b.name)}</h1>
        <h2>Estado de cuenta · {String(result.party.name)}</h2>
        <p>
          {String(result.party.phone)} · {String(result.party.tax_id)}
        </p>
        <p>Generado: {new Date().toLocaleString('es-NI', { timeZone: String(b.timezone) })}</p>
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Fecha / vence</th>
              <th>Total</th>
              <th>Pagado neto</th>
              <th>Devuelto</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  #{String(r.number_prefix || '')}
                  {String(r.number)} {r.state === 'void' ? 'Anulado' : ''}
                </td>
                <td>
                  {String(r.created_at).slice(0, 10)}
                  <small>{String(r.due_date || '')}</small>
                </td>
                <td>{money(r.total)}</td>
                <td>{money(r.paid)}</td>
                <td>{money(r.refunded)}</td>
                <td>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Saldo total: {money(balance.toFixed(2))}</h2>
        <p>
          Los saldos incorporan abonos, devoluciones y anulaciones. Incluye todos los documentos de
          la sucursal seleccionada.
        </p>
      </article>
    </main>
  );
}
