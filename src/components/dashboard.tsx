'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ShoppingCart,
  Wallet,
  Receipt,
  ArrowRight,
  Package,
  Truck,
  CalendarDays,
  Download,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/types';
import { useWorkspace, dateToday, Empty, Notice, Loading, Table, str, ResourceInput } from './ui';
export function Dashboard({
  branch,
  reports,
  onNavigate,
}: {
  branch: string;
  reports: boolean;
  onNavigate: (tab: string) => void;
}) {
  const ctx = useWorkspace();
  const today = dateToday(ctx.business?.timezone);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [user, setUser] = useState('');
  const permitted = ctx.permissions.includes('report.read');
  const money = (n: unknown) => formatMoney(str(n) || 0, ctx.business?.currency);
  const setQuickRange = (preset: 'today' | 'month' | 'prevMonth') => {
    if (preset === 'today') {
      setFrom(today);
      setTo(today);
    } else if (preset === 'month') {
      setFrom(today.slice(0, 8) + '01');
      setTo(today);
    } else if (preset === 'prevMonth') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 1);
      const prevYear = d.getFullYear();
      const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(prevYear, d.getMonth() + 1, 0).getDate();
      setFrom(`${prevYear}-${prevMonth}-01`);
      setTo(`${prevYear}-${prevMonth}-${String(lastDay).padStart(2, '0')}`);
    }
  };
  useEffect(() => {
    if (!permitted) return;
    const c = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const r = await api<Row>(
          `/api/data?${new URLSearchParams({ business: ctx.business!.id, entity: 'report', from, to, branch_id: branch, user_id: user })}`,
          { signal: c.signal },
        );
        setData(r);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => c.abort();
  }, [ctx.business, permitted, branch, from, to, version, user]);
  const low = (data?.low_stock || []) as Row[];
  const top = (data?.top_products || []) as Row[];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {reports ? 'RESULTADOS DEL NEGOCIO' : 'TU FERRETERÍA, DE UN VISTAZO'}
          </span>
          <h1>{reports ? 'Cada número tiene una historia.' : 'Un buen día empieza en orden.'}</h1>
          <p className="muted">
            {reports
              ? 'Consulta las operaciones reales del período.'
              : 'Esto es lo que está pasando en tu negocio.'}
          </p>
        </div>
        {ctx.permissions.includes('sale.create') && (
          <button className="button primary" onClick={() => onNavigate('sell')}>
            <ShoppingCart size={18} />
            Nueva venta
            <ArrowUpRight size={17} />
          </button>
        )}
      </div>
      <div
        className="quick-actions-bar"
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        {ctx.permissions.includes('sale.create') && (
          <button
            type="button"
            className="button secondary compact"
            onClick={() => onNavigate('sell')}
          >
            <ShoppingCart size={15} /> Punto de venta
          </button>
        )}
        {ctx.permissions.includes('products.read') && (
          <button
            type="button"
            className="button secondary compact"
            onClick={() => onNavigate('products')}
          >
            <Package size={15} /> Productos
          </button>
        )}
        {ctx.permissions.includes('money.read') && (
          <button
            type="button"
            className="button secondary compact"
            onClick={() => onNavigate('cash')}
          >
            <Wallet size={15} /> Caja y bancos
          </button>
        )}
        {(ctx.permissions.includes('purchase.receive') || ctx.permissions.includes('purchase.write')) && (
          <button
            type="button"
            className="button secondary compact"
            onClick={() => onNavigate('purchases')}
          >
            <Truck size={15} /> Compras
          </button>
        )}
      </div>
      {!permitted ? (
        <section className="panel welcome-panel">
          <div>
            <h2>Todo listo para tu jornada</h2>
            <p>
              Abre una sección del menú para comenzar. Tu rol determina las operaciones disponibles.
            </p>
          </div>
          <Package size={48} />
        </section>
      ) : (
        <>
          <div className="period-bar">
            <span>
              <CalendarDays size={17} />
              Período
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className={`button compact ${from === today && to === today ? 'primary' : 'secondary'}`}
                style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setQuickRange('today')}
              >
                Hoy
              </button>
              <button
                type="button"
                className={`button compact ${from === today.slice(0, 8) + '01' && to === today ? 'primary' : 'secondary'}`}
                style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setQuickRange('month')}
              >
                Este mes
              </button>
            </div>
            <label>
              Desde
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Hasta
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <span className="muted">
              {ctx.branches.find((b) => b.id === branch)?.name as string}
            </span>
            {reports && (
              <label>
                Usuario (vacío: todos)
                <ResourceInput
                  field={{ name: 'user', label: 'Usuario', resource: 'report_users' }}
                  value={user}
                  onChange={setUser}
                />
              </label>
            )}
            {reports && ctx.permissions.includes('export') && (
              <button
                className="button secondary"
                onClick={() => {
                  if (!data) return;
                  const rows = Object.entries(data)
                    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                    .map(([k, v]) => `${k},${v}`)
                    .join('\r\n');
                  const url = URL.createObjectURL(
                    new Blob(['Concepto,Importe\r\n' + rows], {
                      type: 'text/csv;charset=utf-8',
                    }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `resumen-${from}-${to}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={17} />
                Exportar resumen
              </button>
            )}
          </div>
          {error ? (
            <Notice error>
              {error}
              <button className="text-button" onClick={() => setVersion((v) => v + 1)}>
                Volver a intentar
              </button>
            </Notice>
          ) : loading ? (
            <Loading />
          ) : (
            data && (
              <>
                <div className="metrics">
                  <article className="metric featured">
                    <div>
                      <span>Ventas netas</span>
                      <ShoppingCart size={19} />
                    </div>
                    <strong>{money(data.sales)}</strong>
                    <small>Ventas confirmadas menos devoluciones</small>
                  </article>
                  <article className="metric">
                    <div>
                      <span>Cobros recibidos</span>
                      <Wallet size={19} />
                    </div>
                    <strong>{money(data.collections)}</strong>
                    <small>Pagos de clientes menos reembolsos</small>
                  </article>
                  <article className="metric">
                    <div>
                      <span>Gastos registrados</span>
                      <Receipt size={19} />
                    </div>
                    <strong>{money(data.expenses)}</strong>
                    <small>Obligaciones del período</small>
                  </article>
                  <article className="metric">
                    <div>
                      <span>Margen bruto</span>
                      <ArrowUpRight size={19} />
                    </div>
                    <strong>
                      {data.gross_margin === null ? 'Restringido' : money(data.gross_margin)}
                    </strong>
                    <small>Ventas sin impuestos menos costo vendido</small>
                  </article>
                </div>
                <div className="dashboard-grid">
                  <section className="panel operations-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">CONTROL DEL DÍA</span>
                        <h2>Lo que necesita tu atención</h2>
                      </div>
                      <span className="small-pill">En tiempo real al cargar</span>
                    </div>
                    <div className="attention-row">
                      <span className="attention-icon amber">
                        <Package size={20} />
                      </span>
                      <div>
                        <strong>
                          {low.length
                            ? `${low.length} productos al mínimo o agotados`
                            : 'Existencias sin alertas'}
                        </strong>
                        <p>Revisa qué necesitas reponer.</p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Ver productos"
                        onClick={() => onNavigate('products')}
                      >
                        <ArrowRight size={20} />
                      </button>
                    </div>
                    <div className="attention-row">
                      <span className="attention-icon blue">
                        <Truck size={20} />
                      </span>
                      <div>
                        <strong>{str(data.pending_deliveries)} entregas pendientes</strong>
                        <p>Ventas listas para coordinar su despacho.</p>
                      </div>
                      {ctx.permissions.includes('delivery.write') && (
                        <button
                          className="icon-button"
                          aria-label="Ver entregas"
                          onClick={() => onNavigate('deliveries')}
                        >
                          <ArrowRight size={20} />
                        </button>
                      )}
                    </div>
                    <div className="attention-row">
                      <span className="attention-icon green">
                        <Wallet size={20} />
                      </span>
                      <div>
                        <strong>{money(data.receivable)} por cobrar</strong>
                        <p>Abonos pendientes de tus clientes.</p>
                      </div>
                      {ctx.permissions.includes('parties.read') && (
                        <button
                          className="icon-button"
                          aria-label="Ver clientes"
                          onClick={() => onNavigate('customers')}
                        >
                          <ArrowRight size={20} />
                        </button>
                      )}
                    </div>
                  </section>
                  <section className="panel cash-summary">
                    <span className="eyebrow">EL DINERO DE TU NEGOCIO</span>
                    <h2>Cuentas claras</h2>
                    <dl>
                      <div>
                        <dt>Efectivo esperado en cajas abiertas</dt>
                        <dd>{money(data.cash)}</dd>
                      </div>
                      <div>
                        <dt>Por pagar a proveedores</dt>
                        <dd>{money(data.payable)}</dd>
                      </div>
                      <div>
                        <dt>Salidas de dinero del período</dt>
                        <dd>{money(data.outflows)}</dd>
                      </div>
                      <div className="summary-total">
                        <dt>Resultado operativo estimado</dt>
                        <dd>
                          {data.operating_result === null
                            ? 'Restringido'
                            : money(data.operating_result)}
                        </dd>
                      </div>
                    </dl>
                    <p className="muted">
                      Margen bruto menos gastos y comisiones de tarjeta. Las compras de inventario
                      no se descuentan otra vez como gastos.
                    </p>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Productos más vendidos</h2>
                      <span className="muted">En el período</span>
                    </div>
                    {top.length ? (
                      <div className="ranking">
                        {top.map((r, i) => (
                          <div key={str(r.product_name)}>
                            <span className="rank">{i + 1}</span>
                            <div>
                              <strong>{str(r.product_name)}</strong>
                              <p>{str(r.quantity)} unidades base</p>
                            </div>
                            <strong>{money(r.total)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Tus primeras ventas aparecerán aquí"
                        description="Confirma una venta para empezar a conocer tus productos más vendidos."
                      />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Para reponer</h2>
                      <button className="text-button" onClick={() => onNavigate('products')}>
                        Ver catálogo <ArrowRight size={15} />
                      </button>
                    </div>
                    {low.length ? (
                      <div className="ranking">
                        {low.map((r) => (
                          <div key={str(r.id)}>
                            <span className="product-initial">
                              <Package size={18} />
                            </span>
                            <div>
                              <strong>{str(r.name)}</strong>
                              <p>Mínimo: {str(r.minimum)}</p>
                            </div>
                            <span className="status status-draft">
                              {str(r.available)} disponibles
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Sin productos por reponer"
                        description="Los mínimos aparecerán al registrar tus productos."
                      />
                    )}
                  </section>
                </div>
                {reports && (
                  <>
                    <section className="panel report-definitions">
                      <h2>Cómo se calculan los resultados</h2>
                      <p>
                        Ventas: valor confirmado, transporte e impuestos incluidos, menos
                        devoluciones. Cobros: dinero recibido del cliente. Costo vendido: costo
                        guardado al confirmar cada venta. Egresos: pagos a proveedores, gastos,
                        comisiones y reembolsos; excluye transferencias propias. Los saldos de deuda
                        y caja corresponden al momento de la consulta.
                      </p>
                      <p>
                        El margen excluye impuestos. Una devolución dañada conserva el costo de la
                        venta como pérdida. El filtro por usuario usa el autor de la venta u
                        operación; las existencias son de toda la sucursal.
                      </p>
                      <p>
                        Este resultado es una estimación comercial. No es un estado fiscal ni una
                        liquidación de impuestos.
                      </p>
                      <dl>
                        <div>
                          <dt>Ventas netas sin impuestos</dt>
                          <dd>{money(data.net_revenue)}</dd>
                        </div>
                        <div>
                          <dt>Impuestos de ventas netos</dt>
                          <dd>{money(data.taxes)}</dd>
                        </div>
                        <div>
                          <dt>Compras confirmadas</dt>
                          <dd>{money(data.purchases)}</dd>
                        </div>
                        <div>
                          <dt>Devoluciones del período</dt>
                          <dd>{money(data.returns_total)}</dd>
                        </div>
                        <div>
                          <dt>Diferencias de cierres</dt>
                          <dd>{money(data.cash_difference)}</dd>
                        </div>
                        <div>
                          <dt>Costo de lo vendido</dt>
                          <dd>{data.costs === null ? 'Restringido' : money(data.costs)}</dd>
                        </div>
                        <div>
                          <dt>Comisiones de tarjeta</dt>
                          <dd>{money(data.fees)}</dd>
                        </div>
                        <div>
                          <dt>Inventario vendible valorizado</dt>
                          <dd>{data.valuation === null ? 'Restringido' : money(data.valuation)}</dd>
                        </div>
                      </dl>
                    </section>
                    <section className="panel">
                      <h2>Movimientos de cobros y pagos por cuenta</h2>
                      <Table head={['Cuenta', 'Tipo', 'Movimiento neto']}>
                        {((data.payment_methods || []) as Row[]).map((r) => (
                          <tr key={str(r.name)}>
                            <td>{str(r.name)}</td>
                            <td>
                              {r.kind === 'cash'
                                ? 'Efectivo'
                                : r.kind === 'bank'
                                  ? 'Banco'
                                  : 'Tarjeta'}
                            </td>
                            <td>{money(r.amount)}</td>
                          </tr>
                        ))}
                      </Table>
                      <p className="muted">
                        Cobros, pagos de compras y reembolsos. Excluye transferencias propias,
                        gastos y comisiones.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Productos sin movimientos en el período</h2>
                      <Table head={['Código', 'Producto']}>
                        {((data.slow_products || []) as Row[]).map((r) => (
                          <tr key={str(r.id)}>
                            <td>{str(r.code)}</td>
                            <td>{str(r.name)}</td>
                          </tr>
                        ))}
                      </Table>
                      <p className="muted">
                        Primeros 25 productos sin entradas, salidas o ajustes según los filtros.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Antigüedad de cuentas por cobrar</h2>
                      {(data.aging as Row[]).length ? (
                        <Table head={['Venta', 'Vencimiento', 'Días vencidos', 'Saldo']}>
                          {(data.aging as Row[]).map((r) => (
                            <tr key={str(r.number)}>
                              <td>#{str(r.number)}</td>
                              <td>{str(r.due_date) || 'Sin fecha'}</td>
                              <td>{str(r.days_overdue)}</td>
                              <td>{money(r.balance)}</td>
                            </tr>
                          ))}
                        </Table>
                      ) : (
                        <Empty
                          title="Sin saldos pendientes"
                          description="Las ventas a crédito aparecerán aquí."
                        />
                      )}
                    </section>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
    </>
  );
}
