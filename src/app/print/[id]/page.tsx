import { loadDocument } from '@/lib/document';
import { formatMoney } from '@/lib/money';
import { PrintControls } from '@/components/print-controls';
import Image from 'next/image';
export const dynamic = 'force-dynamic';
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ business?: string }>;
}) {
  const { id } = await params;
  const { business: businessId } = await searchParams;
  const result = businessId ? await loadDocument(businessId, id).catch(() => null) : null;
  if (!result)
    return (
      <main className="setup">
        <h1>Documento no disponible</h1>
        <p>Comprueba tu sesión y tus permisos.</p>
      </main>
    );
  const { document: d, lines, business: b, balance, party } = result;
  const currency = String(b.currency);
  const money = (v: unknown) => formatMoney(String(v || 0), currency);
  return (
    <main className={`print-document ${b.receipt_format === '80mm' ? 'receipt-80' : ''}`}>
      <style>{`@media print { @page { size: ${b.receipt_format === '80mm' ? '80mm 297mm' : 'A4'}; margin: ${b.receipt_format === '80mm' ? '0' : '12mm'}; } }`}</style>
      <PrintControls />
      <article>
        <header>
          {b.logo_path && (
            <Image
              unoptimized
              src={`/api/files?path=${encodeURIComponent(String(b.logo_path))}`}
              width={64}
              height={64}
              alt="Logo"
            />
          )}
          <h1>{String(b.name)}</h1>
          <p>
            {String(b.tax_id)} · {String(b.phone)}
          </p>
          <p>{String(b.address)}</p>
          <h2>
            {d.kind === 'sale'
              ? 'Comprobante de venta'
              : d.kind === 'purchase'
                ? 'Orden de compra'
                : 'Cotización'}{' '}
            #{String(d.number_prefix || '')}
            {String(d.number)}
          </h2>
          <p>
            {d.kind === 'purchase' ? 'Proveedor' : 'Cliente'}:{' '}
            {String(party?.name || (d.party_id ? 'Contacto registrado' : 'Consumidor final'))}
          </p>
          <p>
            {new Date(String(d.created_at)).toLocaleString('es-NI', {
              timeZone: String(b.timezone),
            })}{' '}
            · Estado: {String(d.state)}
          </p>
        </header>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Descuento</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={String(l.id)}>
                <td>
                  {String(l.product_name)}
                  <small>
                    {String(l.presentation_name)}
                    {l.serial ? ` · Serie ${l.serial}` : ''}
                  </small>
                </td>
                <td>{String(l.quantity)}</td>
                <td>{money(l.price)}</td>
                <td>{money(l.discount)}</td>
                <td>{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl>
          <div>
            <dt>Subtotal neto</dt>
            <dd>{money(d.subtotal)}</dd>
          </div>
          <div>
            <dt>Impuestos</dt>
            <dd>{money(d.tax)}</dd>
          </div>
          <div>
            <dt>Transporte</dt>
            <dd>{money(d.transport)}</dd>
          </div>
          {Number(d.extra_cost) > 0 && (
            <div>
              <dt>Costos adicionales</dt>
              <dd>{money(d.extra_cost)}</dd>
            </div>
          )}
          <div>
            <dt>Total</dt>
            <dd>{money(d.total)}</dd>
          </div>
          {balance && d.kind !== 'quote' && (
            <>
              <div>
                <dt>Pagado neto</dt>
                <dd>{money(balance.paid)}</dd>
              </div>
              <div>
                <dt>Saldo pendiente</dt>
                <dd>{money(balance.balance)}</dd>
              </div>
            </>
          )}
        </dl>
        {d.valid_until && <p>Vigencia: {String(d.valid_until)}</p>}
        {d.address && <p>Entrega: {String(d.address)}</p>}
        {d.notes && <p>{String(d.notes)}</p>}
        <p>Comprobante comercial. Sin integración fiscal electrónica.</p>
      </article>
    </main>
  );
}
