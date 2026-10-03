'use client';
import { useState } from 'react';
import { Plus, Printer, ArrowRight, Download, Copy } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/types';
import {
  useWorkspace,
  useData,
  Table,
  FormModal,
  Modal,
  Pagination,
  Notice,
  Status,
  str,
  options,
  type Field,
} from './ui';
import { ModuleHeading, ListState } from './modules';
import { PointOfSale } from './point-of-sale';
import { api } from '@/lib/api';
import { DocumentHistory } from './document-history';
import { FileUpload } from './file-upload';
export function Documents({
  kind,
  branch,
  deliveries = false,
}: {
  kind: 'sale' | 'purchase' | 'quote';
  branch: string;
  deliveries?: boolean;
}) {
  const ctx = useWorkspace();
  const [page, setPage] = useState(0);
  const [state, setState] = useState('');
  const result = useData('documents', {
    kind,
    branch_id: branch,
    page: String(page),
    ...(state ? { state } : {}),
    ...(deliveries ? { pending: 'true' } : {}),
  });
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [converted, setConverted] = useState<{
    document: Row;
    lines: Row[];
    kind: 'sale' | 'quote';
  } | null>(null);
  if (create || converted)
    return (
      <>
        <button
          className="button secondary back-button"
          onClick={() => {
            setCreate(false);
            setConverted(null);
            result.refresh();
          }}
        >
          ← Volver al historial
        </button>
        <PointOfSale
          key={branch}
          branch={branch}
          kind={converted?.kind || kind}
          initial={converted || undefined}
          onComplete={() => {
            result.refresh();
          }}
        />
      </>
    );
  return (
    <>
      <ModuleHeading
        title={
          deliveries
            ? 'Del mostrador a su destino.'
            : kind === 'sale'
              ? 'El historial de tu trabajo.'
              : kind === 'purchase'
                ? 'Compra, recibe y repón.'
                : 'Propuestas para tus clientes.'
        }
        description={
          deliveries
            ? 'La venta ya descontó el inventario. Aquí registras el despacho, incluso por partes.'
            : kind === 'purchase'
              ? 'Una orden prepara la compra. Una recepción incorpora la mercadería.'
              : kind === 'quote'
                ? 'Vigencia, condiciones y conversión a venta. Sin reservas automáticas.'
                : 'Ventas confirmadas, pagos y devoluciones con trazabilidad.'
        }
      >
        {!deliveries &&
          ctx.permissions.includes(
            kind === 'purchase'
              ? 'purchase.write'
              : kind === 'quote'
                ? 'quote.write'
                : 'sale.create',
          ) && (
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={18} />
              {kind === 'purchase'
                ? 'Nueva orden'
                : kind === 'quote'
                  ? 'Nueva cotización'
                  : 'Nueva venta'}
            </button>
          )}
      </ModuleHeading>
      <section className="panel">
        <div className="list-toolbar">
          <span className="muted">{result.count} documentos</span>
          <select
            aria-label="Filtrar estado"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos los estados</option>
            {(kind === 'quote'
              ? ['draft', 'sent', 'accepted', 'rejected', 'expired']
              : ['draft', 'confirmed', 'void']
            ).map((s) => (
              <option key={s} value={s}>
                {
                  (
                    {
                      draft: 'Borrador',
                      confirmed: 'Confirmado',
                      void: 'Anulado',
                      sent: 'Enviada',
                      accepted: 'Aceptada',
                      rejected: 'Rechazada',
                      expired: 'Vencida',
                    } as Record<string, string>
                  )[s]
                }
              </option>
            ))}
          </select>
        </div>
        <ListState data={result}>
          <Table head={['Número', 'Fecha', 'Estado', 'Total', 'Acciones']}>
            {result.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>
                  <strong>#{str(r.number)}</strong>
                </td>
                <td>
                  {new Date(str(r.created_at)).toLocaleString('es-NI', {
                    timeZone: ctx.business?.timezone,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td>
                  <Status value={r.state} />
                </td>
                <td>
                  {r.total !== undefined
                    ? formatMoney(str(r.total), ctx.business?.currency)
                    : 'Costo restringido'}
                </td>
                <td>
                  <button className="button compact" onClick={() => setDetail(r)}>
                    Ver detalle
                    <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {detail && (
        <DocumentDetail
          document={detail}
          onClose={() => setDetail(null)}
          onSaved={result.refresh}
          onConvert={(document, lines, kind) => {
            setDetail(null);
            setConverted({ document, lines, kind });
          }}
        />
      )}
    </>
  );
}
export function DocumentDetail({
  document,
  onClose,
  onSaved,
  onConvert,
}: {
  document: Row;
  onClose: () => void;
  onSaved: () => void;
  onConvert?: (d: Row, lines: Row[], kind: 'sale' | 'quote') => void;
}) {
  const ctx = useWorkspace();
  const [page, setPage] = useState(0);
  const details = useData('documents', { id: str(document.id) });
  const lines = useData('document_lines', {
    id: str(document.id),
    page: String(page),
  });
  const balance = useData('balances', { id: str(document.id) });
  const [form, setForm] = useState('');
  const [converting, setConverting] = useState(false);
  const [conversionError, setConversionError] = useState('');
  async function convert(kind: 'sale' | 'quote') {
    setConverting(true);
    setConversionError('');
    try {
      const all: Row[] = [];
      for (let p = 0; ; p++) {
        const out = await api<{ rows: Row[]; count: number }>(
          `/api/data?${new URLSearchParams({ business: ctx.business!.id, entity: 'document_lines', id: str(d.id), page: String(p) })}`,
        );
        all.push(...out.rows);
        if (all.length >= out.count) break;
      }
      onConvert?.(d, all, kind);
    } catch (e) {
      setConversionError((e as Error).message);
    } finally {
      setConverting(false);
    }
  }
  const [target, setTarget] = useState<Row | null>(null);
  const d = details.rows[0] || document;
  const b = balance.rows[0];
  const isPurchase = d.kind === 'purchase';
  const isQuote = d.kind === 'quote';
  const accounts = ctx.accounts.filter((a) => a.branch_id === d.branch_id);
  let action = '';
  let fields: Field[] = [];
  let initial: Record<string, unknown> = {
    id: d.id,
    document_id: d.id,
    line_id: target?.id,
    branch_id: d.branch_id,
    party_id: d.party_id,
  };
  let transform: ((v: Record<string, unknown>) => Record<string, unknown>) | undefined;
  if (form === 'confirm') {
    action = 'purchase.confirm';
  }
  if (form === 'receive') {
    action = 'purchase.receive';
    fields = [
      {
        name: 'quantity',
        label: `Cantidad a recibir en unidad base (pendiente ${Number(target?.base_quantity) - Number(target?.received)})`,
        type: 'number',
        min: 0.000001,
        max: Number(target?.base_quantity) - Number(target?.received),
        step: '0.000001',
        required: true,
      },
    ];
    transform = (v) => ({
      ...v,
      lines: [{ line_id: target?.id, quantity: v.quantity }],
    });
  }
  if (form === 'pay') {
    action = 'payment.create';
    initial = { ...initial, direction: isPurchase ? 'out' : 'in' };
    fields = [
      {
        name: 'account_id',
        label: 'Cuenta',
        type: 'select',
        options: options(accounts),
        required: true,
      },
      {
        name: 'amount',
        label: 'Abono',
        type: 'number',
        min: 0.01,
        max: Number(b?.balance),
        required: true,
        default: b?.balance,
      },
      { name: 'reference', label: 'Referencia del comprobante' },
    ];
    transform = (v) => ({
      ...v,
      payments: [{ account_id: v.account_id, amount: v.amount, reference: v.reference }],
      applications: [{ document_id: d.id, amount: v.amount }],
    });
  }
  if (form === 'return') {
    action = 'return.create';
    fields = [
      {
        name: 'quantity',
        label: 'Cantidad a devolver en unidad base',
        type: 'number',
        min: 0.000001,
        max: Number(target?.base_quantity) - Number(target?.returned),
        step: '0.000001',
        required: true,
      },
      {
        name: 'reason',
        label: 'Motivo de devolución',
        type: 'textarea',
        required: true,
      },
      {
        name: 'damaged',
        label: 'Producto dañado (no vuelve a vendibles)',
        type: 'checkbox',
      },
      {
        name: 'account_id',
        label: 'Cuenta del reembolso (si corresponde)',
        type: 'select',
        options: options(accounts),
        required: true,
      },
    ];
  }
  if (form === 'deliver') {
    action = 'delivery.create';
    fields = [
      {
        name: 'quantity',
        label: 'Cantidad entregada en unidad base',
        type: 'number',
        min: 0.000001,
        max: Number(target?.base_quantity) - Number(target?.delivered) - Number(target?.returned),
        step: '0.000001',
        required: true,
      },
      {
        name: 'contact',
        label: 'Persona que recibe / constancia',
        required: true,
      },
    ];
  }
  if (form === 'void') {
    action = 'document.void';
    fields = [
      {
        name: 'reason',
        label: 'Motivo de anulación',
        type: 'textarea',
        required: true,
      },
      {
        name: 'account_id',
        label: 'Cuenta para devolver el dinero',
        type: 'select',
        options: options(accounts),
        required: true,
      },
    ];
  }
  if (form === 'state') {
    action = 'quote.state';
    fields = [
      {
        name: 'state',
        label: 'Nuevo estado',
        type: 'select',
        required: true,
        options: [
          { value: 'draft', label: 'Borrador' },
          { value: 'sent', label: 'Enviada' },
          { value: 'accepted', label: 'Aceptada' },
          { value: 'rejected', label: 'Rechazada' },
          { value: 'expired', label: 'Vencida' },
        ],
      },
    ];
  }
  if (form === 'reserve') {
    action = 'quote.reserve';
    fields = [
      {
        name: 'quantity',
        label: 'Unidades base a reservar',
        type: 'number',
        min: 0.000001,
        max: Number(target?.base_quantity),
        step: '0.000001',
        required: true,
      },
      {
        name: 'expires_at',
        label: 'Fecha límite de reserva',
        type: 'date',
        required: true,
      },
    ];
  }
  if (form === 'warranty') {
    action = 'warranty.save';
    initial = { ...initial, id: undefined };
    fields = [
      { name: 'serial', label: 'Número de serie', default: target?.serial },
      {
        name: 'description',
        label: 'Descripción del caso',
        type: 'textarea',
        required: true,
      },
      {
        name: 'state',
        label: 'Estado',
        type: 'select',
        required: true,
        default: 'received',
        options: [
          { value: 'received', label: 'Recibido' },
          { value: 'review', label: 'En revisión' },
          { value: 'resolved', label: 'Resuelto' },
          { value: 'rejected', label: 'Rechazado' },
        ],
      },
    ];
  }
  const refresh = () => {
    details.refresh();
    lines.refresh();
    balance.refresh();
    onSaved();
  };
  return (
    <>
      <Modal
        title={`${isQuote ? 'Cotización' : isPurchase ? 'Compra' : 'Venta'} #${str(d.number_prefix)}${str(d.number)}`}
        onClose={onClose}
      >
        <div className="document-detail">
          {conversionError && <Notice error>{conversionError}</Notice>}
          <div className="document-meta">
            <Status value={d.state} />
            <span className="muted">{str(d.created_at).slice(0, 10)}</span>
          </div>
          {details.error && <Notice error>{details.error}</Notice>}
          {d.notes && <p>{str(d.notes)}</p>}
          {d.address && (
            <p>
              <strong>Entregar en:</strong> {str(d.address)}
            </p>
          )}
          <ListState data={lines}>
            <Table
              head={[
                'Producto',
                'Cantidad',
                'Total',
                isPurchase ? 'Recibido' : 'Entregado',
                'Devuelto',
                'Acciones',
              ]}
            >
              {lines.rows.map((l) => (
                <tr key={str(l.id)}>
                  <td>
                    <strong>{str(l.product_name)}</strong>
                    <small>
                      {str(l.presentation_name)} · factor {str(l.factor)}
                    </small>
                    {l.serial && <small>Serie: {str(l.serial)}</small>}
                  </td>
                  <td>
                    {str(l.quantity)}
                    <small>{str(l.base_quantity)} unidades base</small>
                  </td>
                  <td>
                    {l.total !== undefined
                      ? formatMoney(str(l.total), ctx.business?.currency)
                      : '—'}
                  </td>
                  <td>{str(isPurchase ? l.received : l.delivered)}</td>
                  <td>{str(l.returned)}</td>
                  <td>
                    <div className="row-actions">
                      {isPurchase &&
                        d.state === 'confirmed' &&
                        Number(l.received) < Number(l.base_quantity) &&
                        ctx.permissions.includes('purchase.receive') && (
                          <button
                            className="button compact"
                            onClick={() => {
                              setTarget(l);
                              setForm('receive');
                            }}
                          >
                            Recibir
                          </button>
                        )}
                      {!isPurchase &&
                        !isQuote &&
                        d.state === 'confirmed' &&
                        Number(l.base_quantity) > Number(l.delivered) + Number(l.returned) &&
                        ctx.permissions.includes('delivery.write') && (
                          <button
                            className="button compact"
                            onClick={() => {
                              setTarget(l);
                              setForm('deliver');
                            }}
                          >
                            Entregar
                          </button>
                        )}
                      {!isQuote &&
                        d.state === 'confirmed' &&
                        Number(l.returned) < Number(l.base_quantity) &&
                        ctx.permissions.includes('return.write') && (
                          <>
                            <button
                              className="button compact"
                              onClick={() => {
                                setTarget(l);
                                setForm('return');
                              }}
                            >
                              Devolver
                            </button>
                            <button
                              className="button compact"
                              onClick={() => {
                                setTarget(l);
                                setForm('warranty');
                              }}
                            >
                              Garantía
                            </button>
                          </>
                        )}
                      {isQuote && ctx.permissions.includes('inventory.write') && (
                        <button
                          className="button compact"
                          onClick={() => {
                            setTarget(l);
                            setForm('reserve');
                          }}
                        >
                          Reservar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </ListState>
          <Pagination page={page} count={lines.count} onChange={setPage} />
          <dl className="document-totals">
            <div>
              <dt>Total</dt>
              <dd>
                {d.total !== undefined
                  ? formatMoney(str(d.total), ctx.business?.currency)
                  : 'Costo restringido'}
              </dd>
            </div>
            {!isQuote && b && (
              <>
                <div>
                  <dt>Pagado neto</dt>
                  <dd>{formatMoney(str(b.paid), ctx.business?.currency)}</dd>
                </div>
                <div>
                  <dt>Devuelto</dt>
                  <dd>{formatMoney(str(b.refunded), ctx.business?.currency)}</dd>
                </div>
                <div>
                  <dt>Saldo pendiente</dt>
                  <dd>{formatMoney(str(b.balance), ctx.business?.currency)}</dd>
                </div>
              </>
            )}
          </dl>
          <div className="document-actions">
            {!isQuote &&
              !isPurchase &&
              d.state === 'confirmed' &&
              Number(b?.refunded) > 0 &&
              onConvert &&
              ctx.permissions.includes('sale.create') && (
                <button className="button secondary" onClick={() => onConvert(d, [], 'sale')}>
                  Vender cambio
                </button>
              )}
            <a
              className="button secondary"
              target="_blank"
              rel="noopener noreferrer"
              href={`/print/${d.id}?business=${ctx.business!.id}`}
            >
              <Printer size={17} />
              Imprimir
            </a>
            <a
              className="button secondary"
              href={`/api/pdf?id=${d.id}&business=${ctx.business!.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={17} />
              PDF
            </a>
            {isPurchase && d.state === 'draft' && ctx.permissions.includes('purchase.write') && (
              <button className="button primary" onClick={() => setForm('confirm')}>
                Confirmar orden
              </button>
            )}
            {!isQuote &&
              d.state === 'confirmed' &&
              Number(b?.balance) > 0 &&
              ctx.permissions.includes('payment.write') && (
                <button className="button primary" onClick={() => setForm('pay')}>
                  Registrar abono
                </button>
              )}
            {isQuote && ctx.permissions.includes('quote.write') && (
              <>
                <button className="button secondary" onClick={() => setForm('state')}>
                  Cambiar estado
                </button>
                {onConvert && (
                  <button
                    className="button secondary"
                    disabled={converting}
                    onClick={() => convert('quote')}
                  >
                    <Copy size={16} />
                    Duplicar
                  </button>
                )}
                {onConvert && ctx.permissions.includes('sale.create') && (
                  <button
                    className="button primary"
                    disabled={converting}
                    onClick={() => convert('sale')}
                  >
                    Convertir a venta
                  </button>
                )}
              </>
            )}
            {!isPurchase &&
              !isQuote &&
              d.state === 'confirmed' &&
              ctx.permissions.includes('sale.void') && (
                <button className="button danger" onClick={() => setForm('void')}>
                  Anular venta
                </button>
              )}
          </div>
          <p className="muted">Comprobante comercial. No constituye factura fiscal electrónica.</p>
          {isPurchase && ctx.permissions.includes('purchase.write') && (
            <FileUpload
              id={str(d.id)}
              folder="documents"
              action="document.attach"
              onSaved={refresh}
            />
          )}
          {d.proof_path && (
            <a
              className="button secondary"
              href={`/api/files?path=${encodeURIComponent(str(d.proof_path))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Documento del proveedor
            </a>
          )}
          {!isQuote && <DocumentHistory key={str(d.id)} document={d} onSaved={refresh} />}
        </div>
      </Modal>
      {form && (
        <FormModal
          title={
            form === 'return'
              ? 'Registrar devolución'
              : form === 'deliver'
                ? 'Confirmar entrega'
                : form === 'void'
                  ? 'Anular y revertir venta'
                  : form === 'pay'
                    ? 'Registrar abono'
                    : form === 'receive'
                      ? 'Recibir mercadería'
                      : form === 'reserve'
                        ? 'Reservar existencias'
                        : form === 'warranty'
                          ? 'Registrar garantía'
                          : form === 'state'
                            ? 'Estado de cotización'
                            : 'Confirmar orden'
          }
          action={action}
          fields={fields}
          initial={initial}
          transform={transform}
          onClose={() => {
            setForm('');
            setTarget(null);
          }}
          onSaved={refresh}
          description={
            form === 'return'
              ? 'Primero se reduce la deuda pendiente. El excedente se reembolsa desde la cuenta elegida.'
              : form === 'void'
                ? 'Se revertirá el stock y se devolverá lo cobrado. El historial se conserva.'
                : form === 'confirm'
                  ? 'Confirmar la orden genera la obligación por pagar. No aumenta existencias hasta recibir la mercadería.'
                  : form === 'reserve'
                    ? 'La reserva es explícita y temporal. Se libera al vencer o al convertir esta cotización a venta.'
                    : undefined
          }
          submit={form === 'void' ? 'Confirmar anulación' : 'Confirmar'}
        />
      )}
    </>
  );
}
