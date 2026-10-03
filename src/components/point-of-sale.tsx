'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  ShoppingCart,
  Save,
  ScanLine,
  Check,
  ArrowRight,
  Package,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { api, command } from '@/lib/api';
import { formatMoney, lineTotal } from '@/lib/money';
import type { Row } from '@/lib/types';
import {
  useWorkspace,
  useData,
  SearchBox,
  Pagination,
  Notice,
  Empty,
  ResourceInput,
  dateToday,
  str,
} from './ui';
import { ModuleHeading, ListState } from './modules';
import { DocumentDetail } from './documents';
import { BarcodeCamera } from './scanner';
export type CartLine = {
  key: string;
  product_id: string;
  presentation_id: string;
  name: string;
  presentation_name: string;
  quantity: number;
  price: number;
  discount: number;
  tax_rate: number;
  override: boolean;
  fractional: boolean;
  factor: number;
  serial: string;
  lot: string;
};
type Preview = {
  input?: string;
  total: number;
  subtotal: number;
  tax: number;
  lines: {
    product_id: string;
    presentation_id: string;
    price: number;
    total: number;
  }[];
};
export function PointOfSale({
  branch,
  kind = 'sale',
  onComplete,
  initial,
}: {
  branch: string;
  kind?: 'sale' | 'purchase' | 'quote';
  onComplete?: () => void;
  initial?: { document: Row; lines: Row[] };
}) {
  const ctx = useWorkspace();
  const business = ctx.business!;
  const warehouses = ctx.warehouses.filter((w) => w.branch_id === branch);
  const accounts = ctx.accounts.filter((a) => a.branch_id === branch);
  const storageKey = `ferro.draft.${ctx.user.id}.${business.id}.${branch}.${kind}`;
  const [cart, setCart] = useState<CartLine[]>(
    () =>
      initial?.lines.map((l) => ({
        key: crypto.randomUUID(),
        product_id: str(l.product_id),
        presentation_id: str(l.presentation_id),
        name: str(l.product_name),
        presentation_name: str(l.presentation_name),
        quantity: Number(l.quantity),
        price: Number(l.price),
        discount: Number(l.discount),
        tax_rate: Number(l.tax_rate),
        override: kind === 'purchase',
        fractional: true,
        factor: Number(l.factor),
        serial: str(l.serial),
        lot: str(l.lot),
      })) || [],
  );
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [warehouse, setWarehouse] = useState(str(warehouses[0]?.id));
  const result = useData('products', {
    q,
    page: String(page),
    warehouse_id: warehouse,
  });
  const [party, setParty] = useState(str(initial?.document.party_id));
  const [credit, setCredit] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [due, setDue] = useState(dateToday(business.timezone));
  const [validUntil, setValidUntil] = useState(dateToday(business.timezone));
  const [notes, setNotes] = useState(
    initial?.document.kind === 'sale'
      ? `Cambio relacionado con la venta #${str(initial.document.number_prefix)}${str(initial.document.number)}.`
      : str(initial?.document.notes),
  );
  const [address, setAddress] = useState(str(initial?.document.address));
  const [transport, setTransport] = useState(str(initial?.document.transport) || '0');
  const [extraCost, setExtraCost] = useState('0');
  const [payments, setPayments] = useState<
    { account_id: string; amount: string; reference: string }[]
  >([{ account_id: str(accounts[0]?.id), amount: '', reference: '' }]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [camera, setCamera] = useState(false);
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pricePending, setPricePending] = useState(false);
  const [saved, setSaved] = useState(false);
  const request = useRef({ id: crypto.randomUUID(), body: '' });
  const searchRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const canChangePrice = kind === 'purchase' || ctx.permissions.includes('price.write');
  const readOnly = pending;
  const payload = useMemo(
    () => ({
      kind,
      branch_id: branch,
      warehouse_id: warehouse,
      party_id: party || null,
      lines: cart.map((l) => ({
        product_id: l.product_id,
        presentation_id: l.presentation_id,
        quantity: l.quantity,
        ...(l.override || kind === 'purchase' ? { price: l.price } : {}),
        discount: l.discount,
        serial: l.serial,
        lot: l.lot,
      })),
      credit,
      due_date: credit ? due : undefined,
      deferred,
      notes,
      address,
      transport: Number(transport || 0),
      extra_cost: kind === 'purchase' ? Number(extraCost || 0) : 0,
      valid_until: kind === 'quote' ? validUntil : undefined,
      ...(initial
        ? initial.document.kind === 'sale'
          ? { exchange_for: initial.document.id }
          : { origin_id: initial.document.id }
        : {}),
    }),
    [
      kind,
      branch,
      warehouse,
      party,
      cart,
      credit,
      due,
      deferred,
      notes,
      address,
      transport,
      extraCost,
      validUntil,
      initial,
    ],
  );
  const previewBody = JSON.stringify(payload);
  useEffect(() => {
    if (!cart.length) return;
    const c = new AbortController();
    const timer = setTimeout(async () => {
      setPricePending(true);
      try {
        const p = await api<Preview>('/api/preview', {
          method: 'POST',
          body: JSON.stringify({
            business_id: business.id,
            data: JSON.parse(previewBody),
          }),
          signal: c.signal,
        });
        setPreview({ ...p, input: previewBody });
        setError('');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
          setPreview(null);
        }
      } finally {
        if (!c.signal.aborted) setPricePending(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [previewBody, business.id, cart.length]);
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        checkoutRef.current?.scrollIntoView({ behavior: 'smooth' });
        checkoutRef.current?.querySelector('input')?.focus();
      }
    }
    addEventListener('keydown', keys);
    return () => removeEventListener('keydown', keys);
  }, []);
  const money = (v: string | number) => formatMoney(v, business.currency);
  const currentPreview = preview?.input === previewBody ? preview : null;
  const estimate = cart
    .reduce(
      (sum, l) =>
        sum.plus(
          l.quantity > 0 && l.discount <= l.quantity * l.price
            ? lineTotal(l.quantity, l.price, l.discount, l.tax_rate)
            : 0,
        ),
      new Decimal(transport || 0),
    )
    .plus(kind === 'purchase' ? extraCost || 0 : 0)
    .toNumber();
  const total = cart.length ? (currentPreview?.total ?? estimate) : 0;
  const paid = payments.reduce((s, p) => s.plus(p.amount || 0), new Decimal(0)).toNumber();
  const change = Math.max(0, new Decimal(paid).minus(total).toNumber());
  function add(product: Row, presentation?: Row) {
    const pr =
      presentation ||
      (product.presentations as Row[])?.find((p) => Number(p.factor) === 1) ||
      (product.presentations as Row[])?.[0];
    if (!pr) return;
    const match = cart.find((l) => l.product_id === product.id && l.presentation_id === pr.id);
    if (match)
      setCart(cart.map((l) => (l.key === match.key ? { ...l, quantity: l.quantity + 1 } : l)));
    else
      setCart([
        ...cart,
        {
          key: crypto.randomUUID(),
          product_id: str(product.id),
          presentation_id: str(pr.id),
          name: str(product.name),
          presentation_name: str(pr.name),
          price: Number(pr.price),
          quantity: 1,
          discount: 0,
          tax_rate: Number(product.tax_rate),
          override: kind === 'purchase',
          fractional: Boolean(product.fractional),
          factor: Number(pr.factor),
          serial: '',
          lot: '',
        },
      ]);
    setPreview(null);
    setSaved(false);
  }
  function update(key: string, values: Partial<CartLine>) {
    setCart(cart.map((l) => (l.key === key ? { ...l, ...values } : l)));
    setPreview(null);
    setSaved(false);
  }
  async function confirm() {
    if (pending) return;
    if (!navigator.onLine) {
      setError(
        'Necesitas conexión para confirmar. Guarda el borrador y vuelve a intentar cuando tengas internet.',
      );
      return;
    }
    if (!currentPreview) {
      setError('Espera a que se validen los precios y totales.');
      return;
    }
    if (kind === 'sale' && !credit && paid < total) {
      setError('Los pagos deben cubrir el total de la venta.');
      return;
    }
    let remainingChange = change;
    const applied = payments
      .map((p) => {
        let amount = Number(p.amount || 0);
        if (accounts.find((a) => a.id === p.account_id)?.kind === 'cash') {
          const reduction = Math.min(remainingChange, amount);
          amount -= reduction;
          remainingChange -= reduction;
        }
        return { ...p, amount };
      })
      .filter((p) => p.amount > 0);
    if (kind === 'sale' && remainingChange > 0) {
      setError('El cambio solo se entrega sobre efectivo recibido. Revisa los pagos.');
      return;
    }
    const data = { ...payload, payments: kind === 'sale' ? applied : [] };
    const body = JSON.stringify(data);
    if (request.current.body !== body) request.current = { id: crypto.randomUUID(), body };
    setPending(true);
    setError('');
    try {
      const res = await command<Row>(business.id, 'document.create', data, request.current.id);
      sessionStorage.removeItem(storageKey);
      setCart([]);
      setReceipt({ ...res, kind });
      setSaved(false);
      onComplete?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function saveDraft() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          cart,
          party,
          warehouse,
          credit,
          deferred,
          due,
          validUntil,
          notes,
          address,
          transport,
          extraCost,
          payments,
          request: request.current,
        }),
      );
      setSaved(true);
    } catch {
      setError('No se pudo guardar el borrador en este navegador. Conserva esta pestaña abierta.');
    }
  }
  function restoreDraft() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        setError('No hay un borrador guardado en esta sesión.');
        return;
      }
      const d = JSON.parse(raw);
      if (!Array.isArray(d.cart) || d.cart.length > 200) throw new Error('Borrador inválido');
      setCart(d.cart);
      setParty(d.party || '');
      setWarehouse(d.warehouse);
      setCredit(Boolean(d.credit));
      setDeferred(Boolean(d.deferred));
      setDue(d.due);
      setValidUntil(d.validUntil);
      setNotes(d.notes);
      setAddress(d.address);
      setTransport(d.transport);
      setExtraCost(d.extraCost || '0');
      setPayments(d.payments);
      request.current = d.request;
      setSaved(true);
    } catch {
      setError('No se pudo recuperar el borrador.');
    }
  }
  return (
    <>
      <ModuleHeading
        eyebrow={
          kind === 'sale'
            ? 'PUNTO DE VENTA'
            : kind === 'purchase'
              ? 'NUEVA ORDEN DE COMPRA'
              : 'NUEVA COTIZACIÓN'
        }
        title={
          kind === 'sale'
            ? 'Listos para vender.'
            : kind === 'purchase'
              ? 'Prepara tu próxima compra.'
              : 'Una propuesta clara.'
        }
        description={
          kind === 'sale'
            ? 'Busca, agrega y cobra. F2 buscar · F4 pagos.'
            : kind === 'purchase'
              ? 'Crear una orden no aumenta existencias. Confirma y recibe después.'
              : 'La cotización no reserva inventario automáticamente.'
        }
      >
        <button className="button secondary" onClick={restoreDraft} disabled={readOnly}>
          Recuperar borrador
        </button>
        <button
          className="button secondary"
          onClick={saveDraft}
          disabled={readOnly || !cart.length}
        >
          <Save size={17} />
          {saved ? 'Borrador guardado' : 'Guardar borrador'}
        </button>
      </ModuleHeading>
      {error && <Notice error>{error}</Notice>}
      <div className="pos-layout">
        <section className="panel pos-catalog">
          <div
            className="list-toolbar"
            ref={searchRef}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && result.rows.length === 1 && !readOnly) {
                e.preventDefault();
                add(result.rows[0]);
                setQ('');
              }
            }}
          >
            <SearchBox
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(0);
              }}
              placeholder="Nombre, código o código de barras"
            />
            <button
              className="icon-button"
              aria-label="Leer código con cámara"
              onClick={() => setCamera(true)}
            >
              <ScanLine size={21} />
            </button>
          </div>
          <div className="pos-location">
            <label>
              Bodega
              <select
                value={warehouse}
                disabled={readOnly}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={str(w.id)} value={str(w.id)}>
                    {str(w.name)}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">{result.count} productos</span>
          </div>
          <ListState data={result} emptyTitle="No encontramos productos">
            <div className="product-grid">
              {result.rows
                .filter((r) => r.active)
                .map((r) => (
                  <ProductTile
                    key={str(r.id)}
                    row={r}
                    onAdd={(p) => add(r, p)}
                    disabled={readOnly}
                    currency={business.currency}
                  />
                ))}
            </div>
          </ListState>
          <Pagination page={page} count={result.count} onChange={setPage} />
        </section>
        <section className="panel pos-cart" id="sale-cart">
          <div className="panel-heading">
            <h2>
              <ShoppingCart size={20} /> {kind === 'sale' ? 'Venta actual' : 'Detalle'}
            </h2>
            <span className="small-pill">{cart.length} productos</span>
          </div>
          <div className="cart-client">
            <label>
              {kind === 'purchase' ? 'Proveedor' : 'Cliente'}
              <ResourceInput
                field={{
                  name: 'party',
                  label: kind === 'purchase' ? 'Proveedor' : 'Cliente',
                  type: 'resource',
                  resource: 'parties',
                  filters: {
                    kind: kind === 'purchase' ? 'supplier' : 'customer',
                  },
                  required: kind === 'purchase',
                }}
                value={party}
                onChange={(v) => {
                  setParty(v);
                  setPreview(null);
                }}
              />
            </label>
            {kind !== 'purchase' && !party && <small>Consumidor final</small>}
          </div>
          {!cart.length ? (
            <Empty
              title="Agrega un producto"
              description="Busca en el catálogo o escanea su código."
            />
          ) : (
            <div className="cart-lines">
              {cart.map((l, i) => (
                <div className="cart-line" key={l.key}>
                  <div className="cart-line-title">
                    <div>
                      <strong>{l.name}</strong>
                      <small>
                        {l.presentation_name} · {l.factor}{' '}
                        {l.factor === 1 ? 'unidad base' : 'unidades base'}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Quitar ${l.name}`}
                      disabled={readOnly}
                      onClick={() => {
                        setCart(cart.filter((x) => x.key !== l.key));
                        setPreview(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="cart-line-controls">
                    <label>
                      Cantidad
                      <input
                        aria-label={`Cantidad de ${l.name}`}
                        type="number"
                        min={l.fractional ? 0.000001 : 1}
                        step={l.fractional ? '0.000001' : '1'}
                        value={l.quantity}
                        disabled={readOnly}
                        onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Precio
                      <input
                        aria-label={`Precio de ${l.name}`}
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={readOnly || !canChangePrice}
                        value={l.override ? l.price : (currentPreview?.lines[i]?.price ?? l.price)}
                        onChange={(e) =>
                          update(l.key, {
                            price: Number(e.target.value),
                            override: true,
                          })
                        }
                      />
                    </label>
                    <label>
                      Descuento
                      <input
                        aria-label={`Descuento de ${l.name}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.discount}
                        disabled={readOnly}
                        onChange={(e) => update(l.key, { discount: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <details>
                    <summary>Serie o lote</summary>
                    <div className="form-grid">
                      <label>
                        Serie
                        <input
                          value={l.serial}
                          onChange={(e) => update(l.key, { serial: e.target.value })}
                        />
                      </label>
                      <label>
                        Lote
                        <input
                          value={l.lot}
                          onChange={(e) => update(l.key, { lot: e.target.value })}
                        />
                      </label>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
          <div className="checkout" ref={checkoutRef}>
            <div className="checkout-total">
              <span>Total{pricePending && <small> Validando…</small>}</span>
              <strong>{money(total)}</strong>
            </div>
            {kind === 'sale' && (
              <>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={credit}
                    disabled={readOnly}
                    onChange={(e) => setCredit(e.target.checked)}
                  />
                  Venta a crédito / anticipo
                </label>
                {credit && (
                  <label>
                    Vencimiento
                    <input
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      required
                    />
                  </label>
                )}
                <div className="payments">
                  {payments.map((p, i) => (
                    <div className="payment-row" key={i}>
                      <label>
                        Medio de pago
                        <select
                          aria-label={`Cuenta de pago ${i + 1}`}
                          disabled={readOnly}
                          value={p.account_id}
                          onChange={(e) =>
                            setPayments(
                              payments.map((x, j) =>
                                j === i ? { ...x, account_id: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {accounts.map((a) => (
                            <option key={str(a.id)} value={str(a.id)}>
                              {str(a.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Recibido
                        <input
                          aria-label={`Importe pago ${i + 1}`}
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={p.amount}
                          onChange={(e) =>
                            setPayments(
                              payments.map((x, j) =>
                                j === i ? { ...x, amount: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {payments.length > 1 && (
                        <button
                          className="icon-button"
                          aria-label="Quitar medio de pago"
                          disabled={readOnly}
                          onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <label className="payment-reference">
                        Referencia
                        <input
                          placeholder="Transferencia, voucher…"
                          value={p.reference}
                          disabled={readOnly}
                          onChange={(e) =>
                            setPayments(
                              payments.map((x, j) =>
                                j === i ? { ...x, reference: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <button
                  className="text-button"
                  disabled={readOnly || payments.length >= 10}
                  onClick={() =>
                    setPayments([
                      ...payments,
                      {
                        account_id: str(accounts[0]?.id),
                        amount: '',
                        reference: '',
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Combinar otro medio
                </button>
                <dl className="payment-summary">
                  <div>
                    <dt>{credit ? 'Saldo a crédito' : 'Falta por cobrar'}</dt>
                    <dd>{money(Math.max(0, total - paid))}</dd>
                  </div>
                  <div>
                    <dt>Cambio en efectivo</dt>
                    <dd>{money(change)}</dd>
                  </div>
                </dl>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={deferred}
                    onChange={(e) => setDeferred(e.target.checked)}
                  />
                  Entregar posteriormente
                </label>
                {deferred && (
                  <label>
                    Dirección y contacto
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                    />
                  </label>
                )}
                <label>
                  Costo de transporte
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                  />
                </label>
              </>
            )}
            {kind === 'quote' && (
              <label>
                Vigencia hasta
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </label>
            )}
            {kind === 'purchase' && (
              <>
                <label>
                  Costos adicionales
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={extraCost}
                    onChange={(e) => setExtraCost(e.target.value)}
                  />
                  <small>Distribución proporcional a las unidades base recibidas.</small>
                </label>
                <label>
                  Fecha de vencimiento
                  <input
                    type="date"
                    value={due}
                    onChange={(e) => {
                      setDue(e.target.value);
                      setCredit(true);
                    }}
                  />
                </label>
              </>
            )}
            <label>
              Notas y condiciones
              <textarea
                value={notes}
                rows={2}
                onChange={(e) => setNotes(e.target.value)}
                disabled={readOnly}
              />
            </label>
            <button
              className="button primary full checkout-button"
              disabled={
                pending ||
                !cart.length ||
                !currentPreview ||
                pricePending ||
                (kind === 'purchase' && !party) ||
                (credit && !party)
              }
              onClick={confirm}
            >
              <Check size={19} />
              {pending
                ? 'Confirmando…'
                : kind === 'sale'
                  ? 'Confirmar venta'
                  : kind === 'purchase'
                    ? 'Crear orden'
                    : 'Guardar cotización'}
              <ArrowRight size={17} />
            </button>
            <small className="checkout-note">
              {kind === 'sale'
                ? 'Se validarán el stock, los precios y los pagos antes de confirmar.'
                : 'Documento comercial. Sin integración fiscal.'}
            </small>
          </div>
        </section>
      </div>
      <div className="pos-mobile-summary">
        <button
          onClick={() => {
            searchRef.current?.scrollIntoView();
            searchRef.current?.querySelector('input')?.focus();
          }}
        >
          Buscar
        </button>
        <button onClick={() => document.getElementById('sale-cart')?.scrollIntoView()}>
          {cart.length} productos
        </button>
        <button onClick={() => checkoutRef.current?.scrollIntoView()}>
          <small>Total</small>
          <strong>{money(total)}</strong>
        </button>
      </div>
      {camera && (
        <BarcodeCamera
          onClose={() => setCamera(false)}
          onCode={(code) => {
            setQ(code);
            setPage(0);
            setCamera(false);
          }}
        />
      )}
      {receipt && (
        <DocumentDetail document={receipt} onClose={() => setReceipt(null)} onSaved={() => {}} />
      )}
    </>
  );
}
function ProductTile({
  row,
  onAdd,
  disabled,
  currency,
}: {
  row: Row;
  onAdd: (pr: Row) => void;
  disabled: boolean;
  currency: string;
}) {
  const presentations = (row.presentations || []) as Row[];
  const [id, setId] = useState(
    str(presentations.find((p) => Number(p.factor) === 1)?.id || presentations[0]?.id),
  );
  const pr = presentations.find((p) => p.id === id) || presentations[0];
  return (
    <article className="product-tile">
      <span className="product-initial large">
        <Package size={28} />
      </span>
      <small>
        {str(row.code)} · {str(row.brand) || str(row.category) || 'Producto'}
      </small>
      <h3>{str(row.name)}</h3>
      <span className={Number(row.available) > 0 ? 'stock-ok' : 'stock-low'}>
        {str(row.available)} {str(row.unit)} disponibles
      </span>
      {presentations.length > 1 && (
        <select
          aria-label={`Presentación de ${row.name}`}
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {presentations.map((p) => (
            <option key={str(p.id)} value={str(p.id)}>
              {str(p.name)}
            </option>
          ))}
        </select>
      )}
      <div>
        <strong>{formatMoney(str(pr?.price) || 0, currency)}</strong>
        <button
          className="icon-button add-product"
          disabled={disabled || !pr}
          aria-label={`Agregar ${row.name}`}
          onClick={() => onAdd(pr)}
        >
          <Plus size={21} />
        </button>
      </div>
    </article>
  );
}
