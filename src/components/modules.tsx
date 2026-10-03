'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { Plus, Package, Download, Upload, ArrowRight, Pencil, Wallet, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/types';
import {
  useWorkspace,
  useData,
  SearchBox,
  Pagination,
  Empty,
  Notice,
  Loading,
  FormModal,
  Table,
  Status,
  str,
  options,
  dateToday,
  frequencyOptions,
  type Field,
  Modal,
} from './ui';
import { DocumentDetail } from './documents';
import { ImportProducts, exportProducts } from './product-import';
import { FileUpload } from './file-upload';
import { PlatformBilling } from './platform-billing';
import { CatalogSettings } from './catalog-settings';

export function ModuleHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow || 'GESTIÓN DEL NEGOCIO'}</span>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function ListState({
  data,
  children,
  emptyTitle,
}: {
  data: ReturnType<typeof useData>;
  children: ReactNode;
  emptyTitle?: string;
}) {
  return data.error ? (
    <Notice error>
      {data.error}
      <button className="text-button" onClick={data.refresh}>
        Volver a intentar
      </button>
    </Notice>
  ) : data.loading ? (
    <Loading />
  ) : data.rows.length ? (
    children
  ) : (
    <Empty title={emptyTitle} />
  );
}
export function Catalog() {
  const ctx = useWorkspace();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('name');
  const result = useData('products', { q, page: String(page), sort });
  const [edit, setEdit] = useState<Row | null>(null);
  const [presentation, setPresentation] = useState<Row | null>(null);
  const [rule, setRule] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const can = ctx.permissions.includes('products.write');
  const money = (v: unknown) => formatMoney(str(v) || 0, ctx.business?.currency);
  const fields: Field[] = [
    { name: 'code', label: 'Código interno', required: true },
    { name: 'name', label: 'Nombre del producto', required: true },
    { name: 'barcode', label: 'Código de barras' },
    {
      name: 'unit',
      label: 'Unidad base',
      default: 'unidad',
      required: true,
      hint: 'Unidad, metro, kilogramo…',
    },
    { name: 'category', label: 'Categoría' },
    { name: 'brand', label: 'Marca' },
    {
      name: 'supplier_id',
      label: 'Proveedor habitual',
      type: 'resource',
      resource: 'parties',
      filters: { kind: 'supplier' },
    },
    {
      name: 'parent_id',
      label: 'Producto principal (si es variante)',
      type: 'resource',
      resource: 'products',
    },
    { name: 'variant_size', label: 'Medida / diámetro' },
    { name: 'variant_color', label: 'Color' },
    { name: 'variant_capacity', label: 'Capacidad' },
    {
      name: 'price',
      label: 'Precio público por unidad base',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'wholesale_price',
      label: 'Precio mayorista',
      type: 'number',
      min: 0,
    },
    {
      name: 'minimum',
      label: 'Existencia mínima',
      type: 'number',
      min: 0,
      default: 0,
      step: '0.000001',
    },
    { name: 'location', label: 'Ubicación en bodega' },
    {
      name: 'tax_rate',
      label: 'Impuesto (%)',
      type: 'number',
      min: 0,
      max: 100,
      default: 0,
    },
    {
      name: 'warranty_days',
      label: 'Garantía (días)',
      type: 'number',
      step: '1',
      min: 0,
      default: 0,
    },
    {
      name: 'fractional',
      label: 'Permitir cantidades decimales',
      type: 'checkbox',
    },
    {
      name: 'active',
      label: 'Producto activo',
      type: 'checkbox',
      default: true,
    },
    { name: 'description', label: 'Descripción y variantes', type: 'textarea' },
  ];
  return (
    <>
      <ModuleHeading
        eyebrow="CATÁLOGO Y EXISTENCIAS"
        title="Cada producto, en su lugar."
        description="Presentaciones, precios y disponibilidad para vender con confianza."
      >
        {ctx.permissions.includes('export') && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await exportProducts(ctx.business!.id);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Download size={17} />
            Exportar
          </button>
        )}
        {can && (
          <>
            <button className="button secondary" onClick={() => setImporting(true)}>
              <Upload size={17} />
              Importar
            </button>
            <button className="button primary" onClick={() => setEdit({})}>
              <Plus size={18} />
              Nuevo producto
            </button>
          </>
        )}
      </ModuleHeading>
      <section className="panel">
        <div className="list-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(0);
            }}
            placeholder="Nombre, código, marca o código de barras"
          />
          <span className="muted">{result.count} productos</span>
          {ctx.permissions.includes('export') && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await exportProducts(ctx.business!.id, 'xlsx');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Exportar Excel
            </button>
          )}
          <label>
            Ordenar
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="name">Nombre A–Z</option>
              <option value="name_desc">Nombre Z–A</option>
              <option value="newest">Más recientes</option>
            </select>
          </label>
        </div>
        {error && <Notice error>{error}</Notice>}
        <ListState data={result} emptyTitle="Comienza con tu primer producto">
          <Table
            head={['Producto', 'Unidad', 'Precio público', 'Disponible', 'Estado', 'Acciones']}
          >
            {result.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>
                  <div className="product-cell">
                    <span className="product-initial">
                      {r.photo_path ? (
                        <Image
                          unoptimized
                          src={`/api/files?path=${encodeURIComponent(str(r.photo_path))}`}
                          width={44}
                          height={44}
                          alt=""
                        />
                      ) : (
                        <Package size={20} />
                      )}
                    </span>
                    <div>
                      <strong>{str(r.name)}</strong>
                      <small>
                        {str(r.code)}
                        {r.brand ? ` · ${r.brand}` : ''}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {str(r.unit)}
                  {r.fractional && <small>Permite fracciones</small>}
                </td>
                <td>{money(r.price)}</td>
                <td>
                  <span className={Number(r.available) <= Number(r.minimum) ? 'stock-low' : ''}>
                    {str(r.available)}
                  </span>
                  <small>Mínimo {str(r.minimum)}</small>
                </td>
                <td>
                  <Status value={r.active ? 'active' : 'suspended'} />
                </td>
                <td>
                  <div className="row-actions">
                    {can && (
                      <>
                        <button className="button compact" onClick={() => setEdit(r)}>
                          <Pencil size={15} />
                          Editar
                        </button>
                        {ctx.permissions.includes('price.write') && (
                          <button className="button compact" onClick={() => setPresentation(r)}>
                            Presentaciones
                          </button>
                        )}
                        {ctx.permissions.includes('price.write') && (
                          <button className="button compact" onClick={() => setRule(r)}>
                            Precios por cantidad
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {edit && (
        <FormModal
          title={edit.id ? 'Editar producto' : 'Nuevo producto'}
          action="product.save"
          fields={fields}
          initial={{
            ...edit,
            variant_size: (edit.attributes as Row)?.size,
            variant_color: (edit.attributes as Row)?.color,
            variant_capacity: (edit.attributes as Row)?.capacity,
          }}
          extraContent={
            edit.id ? <FileUpload id={str(edit.id)} onSaved={result.refresh} /> : undefined
          }
          onClose={() => setEdit(null)}
          onSaved={result.refresh}
          transform={(v) => ({
            ...v,
            cost: 0,
            wholesale_price: v.wholesale_price ?? null,
            supplier_id: v.supplier_id || null,
            parent_id: v.parent_id || null,
            attributes: {
              ...((edit.attributes as Row) || {}),
              size: v.variant_size,
              color: v.variant_color,
              capacity: v.variant_capacity,
            },
          })}
        />
      )}
      {presentation && (
        <FormModal
          title={`Presentación · ${presentation.name}`}
          action="presentation.save"
          description="El factor expresa cuántas unidades base contiene. Una caja de 100 tornillos tiene factor 100. Los documentos guardan su propia conversión."
          initial={{ product_id: presentation.id }}
          fields={[
            { name: 'name', label: 'Nombre', required: true },
            {
              name: 'factor',
              label: 'Unidades base por presentación',
              type: 'number',
              min: 0.000001,
              step: '0.000001',
              required: true,
            },
            {
              name: 'price',
              label: 'Precio público por presentación',
              type: 'number',
              min: 0,
              required: true,
            },
          ]}
          onClose={() => setPresentation(null)}
          onSaved={result.refresh}
        />
      )}
      {rule && (
        <FormModal
          title={`Precio especial · ${rule.name}`}
          action="price_rule.save"
          initial={{ product_id: rule.id }}
          description="Precio por unidad base a partir de una cantidad. Puedes limitarlo a un cliente."
          fields={[
            {
              name: 'min_quantity',
              label: 'Desde cuántas unidades base',
              type: 'number',
              min: 0.000001,
              step: '0.000001',
              required: true,
              default: 1,
            },
            {
              name: 'price',
              label: 'Precio por unidad base',
              type: 'number',
              min: 0,
              required: true,
            },
            {
              name: 'party_id',
              label: 'Cliente (opcional)',
              type: 'resource',
              resource: 'parties',
              filters: { kind: 'customer' },
            },
          ]}
          transform={(v) => ({ ...v, party_id: v.party_id || null })}
          onClose={() => setRule(null)}
          onSaved={result.refresh}
        />
      )}
      {importing && <ImportProducts onClose={() => setImporting(false)} onSaved={result.refresh} />}
    </>
  );
}
export function Parties({ kind, branch }: { kind: 'customer' | 'supplier'; branch: string }) {
  const ctx = useWorkspace();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const result = useData('parties', { q, page: String(page), kind });
  const [edit, setEdit] = useState<Row | null>(null);
  const [ledger, setLedger] = useState<Row | null>(null);
  const customer = kind === 'customer';
  const fields: Field[] = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'tax_id', label: 'Identificación fiscal' },
    { name: 'phone', label: 'Teléfono' },
    { name: 'email', label: 'Correo', type: 'email' },
    { name: 'address', label: 'Dirección', type: 'textarea' },
    ...(customer
      ? ([
          {
            name: 'price_level',
            label: 'Nivel de precio',
            type: 'select',
            options: [
              { value: 'public', label: 'Público' },
              { value: 'wholesale', label: 'Mayorista' },
            ],
            default: 'public',
            required: true,
          },
          {
            name: 'credit_limit',
            label: 'Límite de crédito',
            type: 'number',
            min: 0,
            default: 0,
            required: true,
          },
          {
            name: 'credit_days',
            label: 'Plazo de crédito (días)',
            type: 'number',
            min: 0,
            max: 3650,
            step: '1',
            default: 30,
            required: true,
          },
        ] as Field[])
      : []),
  ];
  return (
    <>
      <ModuleHeading
        title={customer ? 'Conoce a tus clientes.' : 'Tus proveedores, a mano.'}
        description={
          customer
            ? 'Contactos, historial y cuentas por cobrar.'
            : 'Contactos, compras y cuentas por pagar.'
        }
      >
        {ctx.permissions.includes('parties.write') && (
          <button className="button primary" onClick={() => setEdit({})}>
            <Plus size={18} />
            {customer ? 'Nuevo cliente' : 'Nuevo proveedor'}
          </button>
        )}
      </ModuleHeading>
      <section className="panel">
        <div className="list-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(0);
            }}
            placeholder="Buscar por nombre"
          />
        </div>
        <ListState data={result}>
          <Table head={['Nombre', 'Contacto', ...(customer ? ['Crédito'] : []), 'Acciones']}>
            {result.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>
                  <strong>{str(r.name)}</strong>
                  <small>{str(r.tax_id)}</small>
                </td>
                <td>
                  {str(r.phone) || 'Sin teléfono'}
                  <small>{str(r.email)}</small>
                </td>
                {customer && (
                  <td>
                    {formatMoney(str(r.credit_limit), ctx.business?.currency)}
                    <small>{str(r.credit_days)} días</small>
                  </td>
                )}
                <td>
                  <div className="row-actions">
                    <button className="button compact" onClick={() => setLedger(r)}>
                      Historial y saldo
                      <ArrowRight size={15} />
                    </button>
                    {ctx.permissions.includes('parties.write') && (
                      <button className="button compact" onClick={() => setEdit(r)}>
                        Editar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {edit && (
        <FormModal
          title={edit.id ? 'Editar contacto' : customer ? 'Nuevo cliente' : 'Nuevo proveedor'}
          action="party.save"
          fields={fields}
          initial={{ ...edit, kind }}
          onClose={() => setEdit(null)}
          onSaved={result.refresh}
        />
      )}
      {ledger && <PartyLedger party={ledger} branch={branch} onClose={() => setLedger(null)} />}
    </>
  );
}
function PartyLedger({
  party,
  branch,
  onClose,
}: {
  party: Row;
  branch: string;
  onClose: () => void;
}) {
  const ctx = useWorkspace();
  const [page, setPage] = useState(0);
  const result = useData('balances', {
    branch_id: branch,
    page: String(page),
    kind: party.kind === 'customer' ? 'sale' : 'purchase',
    party_id: str(party.id),
  });
  const [doc, setDoc] = useState<Row | null>(null);
  const [payment, setPayment] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const rows = result.rows.filter((r) => r.party_id === party.id);
  return (
    <section className="panel ledger">
      <div className="panel-heading">
        <h2>Estado de cuenta · {str(party.name)}</h2>
        <a
          className="button secondary"
          href={`/statement/${party.id}?business=${ctx.business!.id}&branch=${branch}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Imprimir estado completo
        </a>
        <button className="button secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p className="muted">
        Los abonos registran un cobro o un pago y reducen el saldo. No generan otra venta.
      </p>
      <ListState data={result}>
        <Table
          head={['Documento', 'Fecha', 'Total', 'Pagado', 'Saldo', 'Aplicar abono', 'Detalle']}
        >
          {rows.map((r) => (
            <tr key={str(r.id)}>
              <td>
                #{str(r.number)} <Status value={r.state} />
              </td>
              <td>
                {str(r.created_at).slice(0, 10)}
                <small>Vence: {str(r.due_date) || '—'}</small>
              </td>
              <td>{formatMoney(str(r.total), ctx.business?.currency)}</td>
              <td>{formatMoney(str(r.paid), ctx.business?.currency)}</td>
              <td>{formatMoney(str(r.balance), ctx.business?.currency)}</td>
              <td>
                {Number(r.balance) > 0 && (
                  <input
                    aria-label={`Abono documento ${r.number}`}
                    type="number"
                    min="0"
                    max={str(r.balance)}
                    step="0.01"
                    value={selected[str(r.id)] || ''}
                    onChange={(e) => setSelected({ ...selected, [str(r.id)]: e.target.value })}
                  />
                )}
              </td>
              <td>
                <button className="button compact" onClick={() => setDoc(r)}>
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </ListState>
      <Pagination page={page} count={result.count} onChange={setPage} />
      {ctx.permissions.includes('payment.write') && (
        <button
          className="button primary"
          disabled={!Object.values(selected).some((v) => Number(v) > 0)}
          onClick={() => setPayment(true)}
        >
          Registrar abono a seleccionados
        </button>
      )}
      {doc && (
        <DocumentDetail document={doc} onClose={() => setDoc(null)} onSaved={result.refresh} />
      )}{' '}
      {payment && (
        <FormModal
          title="Aplicar abono"
          action="payment.create"
          description="Selecciona la cuenta que recibió o pagó el dinero. Conserva la referencia del comprobante."
          fields={[
            {
              name: 'account_id',
              label: 'Cuenta',
              type: 'select',
              options: options(ctx.accounts.filter((a) => a.branch_id === branch)),
              required: true,
            },
            { name: 'reference', label: 'Referencia' },
          ]}
          initial={{
            branch_id: branch,
            party_id: party.id,
            direction: party.kind === 'customer' ? 'in' : 'out',
          }}
          transform={(v) => ({
            ...v,
            payments: [
              {
                account_id: v.account_id,
                reference: v.reference,
                amount: Object.values(selected).reduce((a, x) => a + Number(x || 0), 0),
              },
            ],
            applications: Object.entries(selected)
              .filter(([, v]) => Number(v) > 0)
              .map(([document_id, amount]) => ({
                document_id,
                amount: Number(amount),
              })),
          })}
          onClose={() => setPayment(false)}
          onSaved={() => {
            setSelected({});
            result.refresh();
          }}
        />
      )}
    </section>
  );
}
export function Inventory({ branch }: { branch: string }) {
  const ctx = useWorkspace();
  const [mode, setMode] = useState<'stock' | 'inventory_moves' | 'transfers'>('stock');
  const [page, setPage] = useState(0);
  const [w, setW] = useState('');
  const result = useData(mode, { warehouse_id: w, page: String(page) });
  const [form, setForm] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const warehouses = ctx.warehouses.filter((w) => w.branch_id === branch);
  const warehouseFields: Field[] = [
    {
      name: 'warehouse_id',
      label: 'Bodega',
      type: 'select',
      options: options(warehouses),
      required: true,
      default: w || str(warehouses[0]?.id),
    },
    {
      name: 'product_id',
      label: 'Producto',
      type: 'resource',
      resource: 'products',
      required: true,
    },
  ];
  let fields: Field[] = [];
  let action = '';
  if (form === 'adjust' || form === 'count') {
    action = 'inventory.adjust';
    fields = [
      ...warehouseFields,
      {
        name: form === 'count' ? 'counted' : 'quantity',
        label: form === 'count' ? 'Conteo físico vendible' : 'Cantidad (+ entrada / − salida)',
        type: 'number',
        step: '0.000001',
        required: true,
        ...(form === 'count' ? { min: 0 } : {}),
      },
      ...(ctx.permissions.includes('cost.read')
        ? [
            {
              name: 'cost',
              label: 'Costo por unidad base (entrada)',
              type: 'number',
              min: 0,
              step: '0.000001',
            } as Field,
          ]
        : []),
      { name: 'reason', label: 'Motivo', type: 'textarea', required: true },
    ];
  } else if (form === 'transfer') {
    action = 'inventory.transfer';
    fields = [
      {
        name: 'from_warehouse',
        label: 'Bodega de salida',
        type: 'select',
        options: options(ctx.warehouses),
        required: true,
      },
      {
        name: 'to_warehouse',
        label: 'Bodega de destino',
        type: 'select',
        options: options(ctx.warehouses),
        required: true,
      },
      warehouseFields[1],
      {
        name: 'quantity',
        label: 'Cantidad en unidad base',
        type: 'number',
        min: 0.000001,
        step: '0.000001',
        required: true,
      },
    ];
  } else if (form === 'receive') {
    action = 'inventory.receive_transfer';
    fields = [];
  }
  return (
    <>
      <ModuleHeading
        title="Existencias bajo control."
        description="Entradas, conteos y traslados con historial verificable."
      >
        {ctx.permissions.includes('inventory.write') && (
          <>
            <button className="button secondary" onClick={() => setForm('count')}>
              Conteo físico
            </button>
            <button className="button secondary" onClick={() => setForm('transfer')}>
              Trasladar
            </button>
            <button className="button primary" onClick={() => setForm('adjust')}>
              <Plus size={18} />
              Ajustar inventario
            </button>
          </>
        )}
      </ModuleHeading>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs">
            {[
              { key: 'stock', label: 'Existencias' },
              { key: 'inventory_moves', label: 'Kardex' },
              { key: 'transfers', label: 'Traslados' },
            ].map((t) => (
              <button
                key={t.key}
                className={mode === t.key ? 'active' : ''}
                onClick={() => {
                  setMode(t.key as typeof mode);
                  setPage(0);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Filtrar bodega"
            value={w}
            onChange={(e) => {
              setW(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas las bodegas</option>
            {ctx.warehouses.map((r) => (
              <option key={str(r.id)} value={str(r.id)}>
                {str(r.name)}
              </option>
            ))}
          </select>
        </div>
        <ListState data={result}>
          {mode === 'stock' ? (
            <Table
              head={[
                'Producto',
                'Bodega',
                'Físico',
                'Reservado',
                'Disponible',
                'Dañado',
                ...(ctx.permissions.includes('cost.read')
                  ? ['Costo promedio', 'Valor vendible']
                  : []),
              ]}
            >
              {result.rows.map((r) => (
                <tr key={str(r.product_id) + str(r.warehouse_id)}>
                  <td>{str(r.product_name) || str(r.product_id).slice(0, 8)}</td>
                  <td>{str(ctx.warehouses.find((w) => w.id === r.warehouse_id)?.name)}</td>
                  <td>{str(r.physical)}</td>
                  <td>{str(r.reserved)}</td>
                  <td>{Number(r.physical) - Number(r.reserved)}</td>
                  <td>{str(r.damaged)}</td>
                  {ctx.permissions.includes('cost.read') && (
                    <>
                      <td>{formatMoney(str(r.average || 0), ctx.business?.currency)}</td>
                      <td>
                        {formatMoney(
                          Number(r.physical) * Number(r.average || 0),
                          ctx.business?.currency,
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </Table>
          ) : mode === 'inventory_moves' ? (
            <Table head={['Fecha', 'Producto', 'Movimiento', 'Cantidad', 'Referencia', 'Motivo']}>
              {result.rows.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(r.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td>{str(r.product_name) || str(r.product_id).slice(0, 8)}</td>
                  <td>{str(r.kind)}</td>
                  <td className={Number(r.quantity) < 0 ? 'error' : 'success'}>
                    {str(r.quantity)}
                  </td>
                  <td>
                    <code>{str(r.origin_id).slice(0, 8)}</code>
                  </td>
                  <td>{str(r.reason)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={['Producto', 'Salida', 'Destino', 'Cantidad', 'Estado', 'Acción']}>
              {result.rows.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(r.product_name) || str(r.product_id).slice(0, 8)}</td>
                  <td>{str(ctx.warehouses.find((w) => w.id === r.from_warehouse)?.name)}</td>
                  <td>{str(ctx.warehouses.find((w) => w.id === r.to_warehouse)?.name)}</td>
                  <td>{str(r.quantity)}</td>
                  <td>{r.received_at ? 'Recibido' : 'En tránsito'}</td>
                  <td>
                    {!r.received_at && ctx.permissions.includes('inventory.write') && (
                      <button
                        className="button compact"
                        onClick={() => {
                          setTarget(r);
                          setForm('receive');
                        }}
                      >
                        Recibir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {form && (
        <FormModal
          title={
            form === 'count'
              ? 'Registrar conteo'
              : form === 'transfer'
                ? 'Enviar traslado'
                : form === 'receive'
                  ? 'Confirmar recepción'
                  : 'Ajustar inventario'
          }
          action={action}
          fields={fields}
          initial={target || {}}
          onClose={() => {
            setForm('');
            setTarget(null);
          }}
          onSaved={result.refresh}
          description={
            form === 'receive'
              ? 'Se incorporará al destino la mercadería en tránsito.'
              : form === 'count'
                ? 'Registra la cantidad física vendible. Se guardará la diferencia como un movimiento.'
                : 'Toda operación genera un movimiento y conserva su origen.'
          }
        />
      )}
    </>
  );
}
export function Cash({ branch }: { branch: string }) {
  const ctx = useWorkspace();
  const [tab, setTab] = useState('sessions');
  const [page, setPage] = useState(0);
  const result = useData(tab, { branch_id: branch, page: String(page) });
  const accountsData = useData('account_balances', { branch_id: branch });
  const [form, setForm] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [summary, setSummary] = useState<Row | null>(null);
  const accounts = ctx.accounts.filter((a) => a.branch_id === branch);
  const can = ctx.permissions.includes('cash.write');
  let fields: Field[] = [];
  let action = '';
  if (form === 'open') {
    action = 'cash.open';
    fields = [
      {
        name: 'account_id',
        label: 'Caja de efectivo',
        type: 'select',
        options: options(accounts.filter((a) => a.kind === 'cash')),
        required: true,
      },
      {
        name: 'opening',
        label: 'Fondo inicial contado',
        type: 'number',
        min: 0,
        required: true,
      },
    ];
  }
  if (form === 'close') {
    action = 'cash.close';
    fields = [
      {
        name: 'counted',
        label: 'Efectivo contado',
        type: 'number',
        min: 0,
        required: true,
      },
      { name: 'reason', label: 'Explicación de diferencias', type: 'textarea' },
    ];
  }
  if (form === 'transfer') {
    action = 'money.transfer';
    fields = [
      {
        name: 'from_account',
        label: 'Cuenta de salida',
        type: 'select',
        options: options(ctx.accounts),
        required: true,
      },
      {
        name: 'to_account',
        label: 'Cuenta de destino',
        type: 'select',
        options: options(ctx.accounts),
        required: true,
      },
      {
        name: 'amount',
        label: 'Importe',
        type: 'number',
        min: 0.01,
        required: true,
      },
      { name: 'reference', label: 'Referencia y motivo', required: true },
    ];
  }
  if (form === 'movement') {
    action = 'money.adjust';
    fields = [
      {
        name: 'account_id',
        label: 'Cuenta',
        type: 'select',
        options: options(accounts),
        required: true,
      },
      {
        name: 'direction',
        label: 'Movimiento',
        type: 'select',
        options: [
          { value: 'deposit', label: 'Depósito / aporte' },
          { value: 'withdrawal', label: 'Retiro' },
        ],
        required: true,
      },
      { name: 'amount', label: 'Importe', type: 'number', min: 0.01, required: true },
      { name: 'reference', label: 'Motivo y referencia', required: true },
    ];
  }
  return (
    <>
      <ModuleHeading
        title="Cada córdoba, en su cuenta."
        description="Turnos de caja, bancos, tarjetas y movimientos separados."
      >
        {can && (
          <>
            <button className="button secondary" onClick={() => setForm('transfer')}>
              Transferir entre cuentas
            </button>
            <button className="button primary" onClick={() => setForm('open')}>
              <Plus size={18} />
              Abrir caja
            </button>
            <button className="button secondary" onClick={() => setForm('movement')}>
              Depósito o retiro
            </button>
          </>
        )}
      </ModuleHeading>
      <section className="panel">
        <h2>Saldos por cuenta</h2>
        <ListState data={accountsData}>
          <Table head={['Cuenta', 'Tipo', 'Saldo actual']}>
            {accountsData.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>{str(r.name)}</td>
                <td>{r.kind === 'cash' ? 'Efectivo' : r.kind === 'bank' ? 'Banco' : 'Tarjeta'}</td>
                <td>{formatMoney(str(r.balance), ctx.business?.currency)}</td>
              </tr>
            ))}
          </Table>
        </ListState>
        <p className="muted">
          Caja abierta: saldo esperado; caja cerrada: último conteo. Bancos y tarjetas: movimientos
          registrados desde su saldo inicial cero.
        </p>
      </section>
      <section className="panel">
        <div className="tabs">
          {[
            { key: 'sessions', label: 'Turnos de caja' },
            { key: 'money_moves', label: 'Movimientos' },
          ].map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => {
                setTab(t.key);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ListState data={result}>
          {tab === 'sessions' ? (
            <Table
              head={[
                'Caja',
                'Apertura',
                'Fondo inicial',
                'Esperado / contado',
                'Estado',
                'Acciones',
              ]}
            >
              {result.rows.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(ctx.accounts.find((a) => a.id === r.account_id)?.name)}</td>
                  <td>{str(r.opened_at).slice(0, 16).replace('T', ' ')}</td>
                  <td>{formatMoney(str(r.opening), ctx.business?.currency)}</td>
                  <td>
                    {r.closed_at
                      ? `${formatMoney(str(r.expected), ctx.business?.currency)} / ${formatMoney(str(r.counted), ctx.business?.currency)}`
                      : 'Turno abierto'}
                  </td>
                  <td>
                    <Status value={r.closed_at ? 'confirmed' : 'draft'} />
                  </td>
                  <td>
                    {!r.closed_at && r.user_id === ctx.user.id && can ? (
                      <button
                        className="button compact"
                        onClick={() => {
                          setTarget(r);
                          setForm('close');
                        }}
                      >
                        Cerrar caja
                      </button>
                    ) : (
                      r.closed_at && (
                        <button className="button compact" onClick={() => setSummary(r)}>
                          <Printer size={15} />
                          Comprobante
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={['Fecha', 'Cuenta', 'Tipo', 'Importe', 'Referencia']}>
              {result.rows.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(r.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td>{str(ctx.accounts.find((a) => a.id === r.account_id)?.name)}</td>
                  <td>{str(r.kind)}</td>
                  <td className={Number(r.amount) < 0 ? 'error' : 'success'}>
                    {formatMoney(str(r.amount), ctx.business?.currency)}
                  </td>
                  <td>{str(r.reference) || str(r.origin_id).slice(0, 8)}</td>
                </tr>
              ))}
            </Table>
          )}
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {form && (
        <FormModal
          title={
            form === 'open'
              ? 'Abrir turno'
              : form === 'close'
                ? 'Cerrar turno de caja'
                : form === 'movement'
                  ? 'Depósito o retiro'
                  : 'Transferir dinero'
          }
          action={action}
          fields={fields}
          initial={target || {}}
          onClose={() => {
            setForm('');
            setTarget(null);
          }}
          onSaved={() => {
            result.refresh();
            accountsData.refresh();
          }}
          description={
            form === 'close'
              ? 'El saldo esperado se calcula en el servidor con los movimientos de este turno. Una vez cerrado no se puede modificar.'
              : form === 'transfer'
                ? 'Una transferencia entre cuentas propias no crea ingresos ni gastos.'
                : undefined
          }
        />
      )}{' '}
      {summary && (
        <section className="panel printable">
          <div className="panel-heading">
            <h2>
              Cierre de caja · {str(ctx.accounts.find((a) => a.id === summary.account_id)?.name)}
            </h2>
            <button className="button" onClick={() => window.print()}>
              <Printer size={17} />
              Imprimir / guardar PDF
            </button>
            <button className="button" onClick={() => setSummary(null)}>
              Cerrar
            </button>
          </div>
          <p>
            {ctx.business?.name} · {str(summary.closed_at)}
          </p>
          <dl>
            <div>
              <dt>Fondo inicial</dt>
              <dd>{formatMoney(str(summary.opening), ctx.business?.currency)}</dd>
            </div>
            <div>
              <dt>Saldo esperado</dt>
              <dd>{formatMoney(str(summary.expected), ctx.business?.currency)}</dd>
            </div>
            <div>
              <dt>Conteo real</dt>
              <dd>{formatMoney(str(summary.counted), ctx.business?.currency)}</dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd>
                {formatMoney(
                  Number(summary.counted) - Number(summary.expected),
                  ctx.business?.currency,
                )}
              </dd>
            </div>
          </dl>
          <p>Motivo: {str(summary.reason) || 'Sin diferencia'}</p>
        </section>
      )}
    </>
  );
}
export function Expenses({ branch }: { branch: string }) {
  const ctx = useWorkspace();
  const [tab, setTab] = useState('expenses');
  const [page, setPage] = useState(0);
  const result = useData(tab, { branch_id: branch, page: String(page) });
  const [form, setForm] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  let fields: Field[] = [];
  let action = '';
  const basics: Field[] = [
    { name: 'description', label: 'Descripción', required: true },
    { name: 'category', label: 'Categoría', required: true },
    {
      name: 'amount',
      label: 'Importe',
      type: 'number',
      min: 0.01,
      required: true,
    },
  ];
  if (form === 'expenses') {
    action = 'expense.save';
    fields = [
      ...basics,
      {
        name: 'due_date',
        label: 'Fecha de obligación',
        type: 'date',
        required: true,
        default: dateToday(ctx.business?.timezone),
      },
      { name: 'beneficiary', label: 'Beneficiario' },
    ];
  }
  if (form === 'expense_rules') {
    action = 'expense_rule.save';
    fields = [
      ...basics,
      {
        name: 'frequency',
        label: 'Periodicidad',
        type: 'select',
        required: true,
        options: frequencyOptions,
      },
      {
        name: 'next_date',
        label: 'Primera fecha',
        type: 'date',
        required: true,
        default: dateToday(ctx.business?.timezone),
      },
    ];
  }
  if (form === 'employees') {
    action = 'employee.save';
    fields = [
      { name: 'name', label: 'Nombre del empleado', required: true },
      {
        name: 'salary',
        label: 'Salario por período',
        type: 'number',
        min: 0,
        required: true,
      },
      {
        name: 'frequency',
        label: 'Frecuencia de pago',
        type: 'select',
        required: true,
        options: frequencyOptions,
      },
      {
        name: 'commission',
        label: 'Comisión de referencia (%) · cálculo manual',
        type: 'number',
        min: 0,
        max: 100,
        default: 0,
      },
      {
        name: 'schedule',
        label: 'Programar obligación de salario automáticamente',
        type: 'checkbox',
      },
      {
        name: 'next_date',
        label: 'Primera fecha del salario programado',
        type: 'date',
        default: dateToday(ctx.business?.timezone),
        required: true,
      },
    ];
  }
  if (form === 'pay') {
    action = 'expense.pay';
    fields = [
      {
        name: 'account_id',
        label: 'Cuenta de pago',
        type: 'select',
        required: true,
        options: options(ctx.accounts.filter((a) => a.branch_id === branch)),
      },
    ];
  }
  if (form === 'toggle') {
    action = 'expense_rule.toggle';
    fields = [{ name: 'active', label: 'Programación activa', type: 'checkbox' }];
  }
  return (
    <>
      <ModuleHeading
        title="Obligaciones sin sorpresas."
        description="Registrar un gasto no significa pagarlo. Cada salida de dinero se confirma por separado."
      >
        <button className="button primary" onClick={() => setForm(tab)}>
          <Plus size={18} />
          {tab === 'employees'
            ? 'Agregar empleado'
            : tab === 'expense_rules'
              ? 'Programar gasto'
              : 'Registrar gasto'}
        </button>
      </ModuleHeading>
      <section className="panel">
        <div className="tabs">
          {[
            { key: 'expenses', label: 'Gastos' },
            { key: 'expense_rules', label: 'Programación' },
            ...(ctx.permissions.includes('users.write')
              ? [{ key: 'employees', label: 'Empleados' }]
              : []),
          ].map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => {
                setTab(t.key);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ListState data={result}>
          <Table
            head={
              tab === 'employees'
                ? ['Empleado', 'Salario', 'Frecuencia', 'Comisión']
                : [
                    'Descripción',
                    'Importe',
                    tab === 'expense_rules' ? 'Próxima fecha' : 'Fecha',
                    'Estado',
                    'Acción',
                  ]
            }
          >
            {result.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>
                  <strong>{str(r.name || r.description)}</strong>
                  <small>{str(r.category)}</small>
                </td>
                <td>{formatMoney(str(r.amount || r.salary), ctx.business?.currency)}</td>
                <td>{str(r.due_date || r.next_date || r.frequency)}</td>
                <td>
                  {tab === 'employees'
                    ? `${str(r.commission)} %`
                    : tab === 'expense_rules'
                      ? r.active
                        ? str(r.frequency)
                        : 'Programación pausada'
                      : r.paid_at
                        ? 'Pagado'
                        : 'Pendiente'}
                </td>
                {tab !== 'employees' && (
                  <td>
                    {tab === 'expense_rules' && (
                      <button
                        className="button compact"
                        onClick={() => {
                          setTarget({ ...r, active: !r.active });
                          setForm('toggle');
                        }}
                      >
                        {r.active ? 'Pausar programación' : 'Reactivar programación'}
                      </button>
                    )}
                    {tab === 'expenses' && (
                      <>
                        <button
                          className="button compact"
                          onClick={() => {
                            setTarget(r);
                            setForm('attachment');
                          }}
                        >
                          Adjuntar comprobante
                        </button>
                        {r.proof_path && (
                          <a
                            className="button compact"
                            href={`/api/files?path=${encodeURIComponent(str(r.proof_path))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver comprobante
                          </a>
                        )}
                      </>
                    )}
                    {tab === 'expenses' && !r.paid_at && (
                      <button
                        className="button compact"
                        onClick={() => {
                          setTarget(r);
                          setForm('pay');
                        }}
                      >
                        <Wallet size={15} />
                        Pagar gasto
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </Table>
        </ListState>
        <Pagination page={page} count={result.count} onChange={setPage} />
      </section>
      {tab === 'expense_rules' && (
        <Notice>
          Las obligaciones se generan en el servidor cada día. Cada 7 o 14 días desde la fecha
          inicial, o mensualmente en el mismo día; los meses cortos usan su último día. Nunca se
          pagan automáticamente.
        </Notice>
      )}
      {form === 'attachment' && target && (
        <Modal
          title="Comprobante del gasto"
          onClose={() => {
            setForm('');
            setTarget(null);
          }}
        >
          <div className="document-detail">
            <FileUpload
              id={str(target.id)}
              folder="documents"
              action="expense.attach"
              onSaved={result.refresh}
            />
          </div>
        </Modal>
      )}
      {form && form !== 'attachment' && (
        <FormModal
          title={
            form === 'pay'
              ? 'Pagar gasto'
              : form === 'toggle'
                ? 'Estado de programación'
                : form === 'expense_rules'
                  ? 'Programar obligación'
                  : form === 'employees'
                    ? 'Nuevo empleado'
                    : 'Registrar gasto'
          }
          action={action}
          fields={fields}
          initial={{ ...target, branch_id: branch }}
          onClose={() => {
            setForm('');
            setTarget(null);
          }}
          onSaved={result.refresh}
        />
      )}
    </>
  );
}
export function SettingsScreen({ settings }: { settings: Row }) {
  const ctx = useWorkspace();
  const [form, setForm] = useState('');
  const [tab, setTab] = useState('business');
  const [catalogs, setCatalogs] = useState(false);
  const [member, setMember] = useState<Row | null>(null);
  const result = useData(tab === 'audit' ? 'audit' : 'memberships');
  const fields: Record<string, Field[]> = {
    business: [
      { name: 'name', label: 'Nombre comercial', required: true },
      {
        name: 'currency',
        label: 'Símbolo de moneda',
        default: 'C$',
        required: true,
      },
      {
        name: 'timezone',
        label: 'Zona horaria',
        default: 'America/Managua',
        required: true,
      },
      { name: 'tax_id', label: 'Identificación fiscal' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'address', label: 'Dirección', type: 'textarea' },
      {
        name: 'receipt_format',
        label: 'Formato de comprobante',
        type: 'select',
        required: true,
        options: [
          { value: 'a4', label: 'Hoja A4' },
          { value: '80mm', label: 'Ticket de 80 mm' },
        ],
        default: 'a4',
      },
      {
        name: 'max_discount',
        label: 'Descuento máximo sin autorización (%)',
        type: 'number',
        min: 0,
        max: 100,
      },
    ],
    branch: [{ name: 'name', label: 'Nombre de sucursal', required: true }],
    warehouse: [
      { name: 'name', label: 'Nombre de bodega', required: true },
      {
        name: 'branch_id',
        label: 'Sucursal',
        type: 'select',
        required: true,
        options: options(ctx.branches),
      },
    ],
    account: [
      { name: 'name', label: 'Nombre de caja o cuenta', required: true },
      {
        name: 'branch_id',
        label: 'Sucursal',
        type: 'select',
        required: true,
        options: options(ctx.branches),
      },
      {
        name: 'account_kind',
        label: 'Tipo de medio',
        type: 'select',
        required: true,
        options: [
          { value: 'cash', label: 'Efectivo' },
          { value: 'bank', label: 'Banco / transferencia' },
          { value: 'card', label: 'Tarjeta' },
        ],
      },
      {
        name: 'commission',
        label: 'Comisión de tarjeta (%)',
        type: 'number',
        min: 0,
        max: 100,
        default: 0,
      },
    ],
    numbering: [
      {
        name: 'kind',
        label: 'Tipo de documento',
        type: 'select',
        required: true,
        options: [
          { value: 'sale', label: 'Ventas' },
          { value: 'purchase', label: 'Compras' },
          { value: 'quote', label: 'Cotizaciones' },
        ],
      },
      { name: 'prefix', label: 'Prefijo (opcional)' },
      {
        name: 'next_number',
        label: 'Siguiente número',
        type: 'number',
        step: '1',
        min: 1,
        required: true,
      },
    ],
    member: [
      {
        name: 'email',
        label: 'Correo de la persona',
        type: 'email',
        hint: 'La persona debe crear y confirmar su cuenta antes de asignar acceso.',
      },
      {
        name: 'user_id',
        label: 'ID del usuario de Supabase Auth',
        hint: 'Opcional si indicas el correo. Para cuentas existentes también puedes usar su UUID.',
      },
      {
        name: 'role',
        label: 'Rol',
        type: 'select',
        required: true,
        options: ['ADMIN', 'VENDEDOR', 'CAJERO', 'BODEGUERO', 'CONTADOR', 'CONSULTA'].map(
          (value) => ({ value, label: value }),
        ),
      },
      {
        name: 'permissions_text',
        label: 'Permisos adicionales (separados por coma)',
        hint: 'cost.read, price.write, discount.authorize, sale.void, export…',
      },
      {
        name: 'active',
        label: 'Acceso activo',
        type: 'checkbox',
        default: true,
      },
    ],
  };
  return (
    <>
      <ModuleHeading
        title="Un sistema a tu medida."
        description="Configuración del negocio, ubicaciones, cuentas y acceso por usuario."
      >
        <button className="button secondary" onClick={() => setCatalogs(true)}>
          Unidades, categorías y marcas
        </button>
      </ModuleHeading>
      {catalogs && <CatalogSettings onClose={() => setCatalogs(false)} />}
      <section className="panel">
        <div className="tabs">
          {[
            { key: 'business', label: 'Negocio y estructura' },
            { key: 'members', label: 'Usuarios y permisos' },
            { key: 'audit', label: 'Registro de acciones' },
          ].map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'business' ? (
          <>
            <div className="settings-overview">
              <div>
                <span className="eyebrow">NEGOCIO</span>
                <h2>{ctx.business?.name}</h2>
                <p>{str(settings.address) || 'Dirección sin configurar'}</p>
                <p>
                  {ctx.business?.currency} · {ctx.business?.timezone}
                </p>
                <button className="button secondary" onClick={() => setForm('business')}>
                  <Pencil size={17} />
                  Editar negocio
                </button>
                <div className="row-actions">
                  <button className="button secondary" onClick={() => setForm('numbering')}>
                    Numeración de documentos
                  </button>
                </div>
                <FileUpload
                  id={ctx.business!.id}
                  action="business.attach"
                  label="Logo del negocio"
                  onSaved={() => location.reload()}
                />
              </div>
              <div>
                <h3>Sucursales</h3>
                {ctx.branches.map((r) => (
                  <p key={str(r.id)}>{str(r.name)}</p>
                ))}
                <button className="text-button" onClick={() => setForm('branch')}>
                  <Plus size={16} />
                  Agregar sucursal
                </button>
              </div>
              <div>
                <h3>Bodegas</h3>
                {ctx.warehouses.map((r) => (
                  <p key={str(r.id)}>{str(r.name)}</p>
                ))}
                <button className="text-button" onClick={() => setForm('warehouse')}>
                  <Plus size={16} />
                  Agregar bodega
                </button>
              </div>
            </div>
            <h3>Cajas, bancos y medios de pago</h3>
            <Table head={['Nombre', 'Tipo', 'Comisión']}>
              {ctx.accounts.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(r.name)}</td>
                  <td>{str(r.kind)}</td>
                  <td>{str(r.commission)} %</td>
                </tr>
              ))}
            </Table>
            <button className="button secondary" onClick={() => setForm('account')}>
              <Plus size={17} />
              Agregar caja o cuenta
            </button>
          </>
        ) : tab === 'members' ? (
          <>
            <button className="button primary" onClick={() => setForm('member')}>
              <Plus size={17} />
              Asignar acceso
            </button>
            <ListState data={result}>
              <Table head={['Usuario', 'Rol', 'Permisos adicionales', 'Estado', 'Acción']}>
                {result.rows.map((r) => (
                  <tr key={str(r.user_id)}>
                    <td>
                      <strong>{str(r.email)}</strong>
                      <code>{str(r.user_id)}</code>
                    </td>
                    <td>{str(r.role)}</td>
                    <td>
                      {Array.isArray(r.permissions) ? r.permissions.join(', ') : str(r.permissions)}
                    </td>
                    <td>{r.active ? 'Activo' : 'Desactivado'}</td>
                    <td>
                      <button
                        className="button compact"
                        onClick={() => {
                          setMember(r);
                          setForm('member');
                        }}
                      >
                        Editar acceso
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </ListState>
            <Notice>
              Los roles se validan también en el servidor y en la base de datos. Un usuario no puede
              cambiar su propia pertenencia para obtener más privilegios.
            </Notice>
          </>
        ) : (
          <ListState data={result}>
            <Table head={['Fecha', 'Acción', 'Usuario', 'Origen']}>
              {result.rows.map((r) => (
                <tr key={str(r.id)}>
                  <td>{str(r.created_at).slice(0, 19)}</td>
                  <td>{str(r.action)}</td>
                  <td>{str(r.user_id).slice(0, 8)}</td>
                  <td>{str(r.origin_id).slice(0, 8)}</td>
                </tr>
              ))}
            </Table>
          </ListState>
        )}
      </section>
      {form && (
        <FormModal
          title={
            form === 'business'
              ? 'Editar negocio'
              : form === 'member'
                ? 'Asignar acceso'
                : form === 'numbering'
                  ? 'Numeración de documentos'
                  : `Agregar ${form === 'branch' ? 'sucursal' : form === 'warehouse' ? 'bodega' : 'cuenta'}`
          }
          action={
            form === 'business'
              ? 'settings.save'
              : form === 'member'
                ? 'membership.save'
                : form === 'numbering'
                  ? 'numbering.save'
                  : 'structure.save'
          }
          fields={fields[form]}
          initial={
            form === 'business'
              ? settings
              : form === 'member'
                ? {
                    ...member,
                    permissions_text: Array.isArray(member?.permissions)
                      ? member.permissions.join(', ')
                      : '',
                  }
                : { kind: form }
          }
          transform={(v) =>
            form === 'member'
              ? {
                  ...v,
                  permissions: str(v.permissions_text)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : v
          }
          onClose={() => {
            setForm('');
            setMember(null);
          }}
          onSaved={() => location.reload()}
        />
      )}
    </>
  );
}
export function Platform() {
  const [billing, setBilling] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    api<Row[]>('/api/platform', {
      method: 'POST',
      body: JSON.stringify({ action: 'list' }),
    })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <ModuleHeading
        title="Administración de plataforma."
        description="Gestiona los estados de acceso sin borrar información comercial."
      />
      {error && <Notice error>{error}</Notice>}
      <section className="panel">
        <Table head={['Negocio', 'Estado', 'Creación', 'Acción']}>
          {rows.map((r) => (
            <tr key={str(r.id)}>
              <td>{str(r.name)}</td>
              <td>
                <Status value={r.status} />
              </td>
              <td>{str(r.created_at).slice(0, 10)}</td>
              <td>
                <button className="button compact" onClick={() => setBilling(r)}>
                  Suscripción y pagos
                </button>
                <button className="button compact" onClick={() => setTarget(r)}>
                  {r.status === 'active' ? 'Suspender' : 'Reactivar'}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </section>
      {target && (
        <section className="panel">
          <h2>
            {target.status === 'active' ? 'Suspender' : 'Reactivar'} {str(target.name)}
          </h2>
          <p>El cambio queda registrado. Sus datos se conservan.</p>
          <div className="row-actions">
            <button className="button secondary" disabled={pending} onClick={() => setTarget(null)}>
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await api('/api/platform', {
                    method: 'POST',
                    body: JSON.stringify({
                      action: 'status',
                      data: {
                        business_id: target.id,
                        status: target.status === 'active' ? 'suspended' : 'active',
                      },
                    }),
                  });
                  location.reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setPending(false);
                }
              }}
            >
              Confirmar cambio
            </button>
          </div>
        </section>
      )}
      {billing && <PlatformBilling business={billing} onClose={() => setBilling(null)} />}
    </>
  );
}
