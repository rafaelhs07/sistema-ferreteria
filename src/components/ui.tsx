'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
} from 'react';
import {
  AlertCircle,
  Search,
  X,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
} from 'lucide-react';
import type { Context, Row } from '@/lib/types';
import { api, command, ApiError } from '@/lib/api';
export const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error('Workspace');
  return c;
}
export const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
export type ListData = { rows: Row[]; count: number; page: number };
export function useData(entity: string, params: Record<string, string> = {}) {
  const ctx = useWorkspace();
  const term = params.q || '';
  const [search, setSearch] = useState(term);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(term), 200);
    return () => clearTimeout(timer);
  }, [term]);
  const query = new URLSearchParams({
    business: ctx.business?.id || '',
    entity,
    ...params,
    q: search,
  }).toString();
  const [data, setData] = useState<ListData>({ rows: [], count: 0, page: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const d = await api<ListData>(`/api/data?${query}`, {
          signal: abort.signal,
        });
        if (active) setData(d);
      } catch (e) {
        if (active && (e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      abort.abort();
    };
  }, [query, version]);
  return { ...data, error, loading, refresh };
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = 'Todavía no hay registros',
  description = 'Agrega el primero para comenzar.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <PackageOpen size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Cargando información…
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Buscar…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button aria-label="Limpiar búsqueda" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Pagination({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {count === 0
          ? '0 registros'
          : `${page * 25 + 1}–${Math.min(count, (page + 1) * 25)} de ${count}`}
      </span>
      <div>
        <button
          aria-label="Página anterior"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>{page + 1}</span>
        <button
          aria-label="Página siguiente"
          disabled={(page + 1) * 25 >= count}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'checkbox' | 'select' | 'textarea' | 'resource';
  required?: boolean;
  options?: { value: string; label: string }[];
  resource?: string;
  filters?: Record<string, string>;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
  default?: unknown;
};
export function ResourceInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const result = useData(field.resource || 'products', {
    ...field.filters,
    q,
    page: String(page),
  });
  return (
    <div className="resource-input">
      <input
        aria-label={`Buscar ${field.label.toLowerCase()}`}
        placeholder="Escribe para buscar…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
      />
      <select
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
      >
        <option value="">Seleccionar…</option>
        {value && !result.rows.some((r) => r.id === value) && (
          <option value={value}>Seleccionado · {value.slice(0, 8)}</option>
        )}
        {result.rows.map((r) => (
          <option key={str(r.id)} value={str(r.id)}>
            {str(r.name || r.product_name || r.number || r.description)}
            {r.code ? ` · ${r.code}` : ''}
          </option>
        ))}
      </select>
      {result.error && <small className="error">{result.error}</small>}
      {result.count > 25 && <Pagination page={page} count={result.count} onChange={setPage} />}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Cerrar ventana" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function FormModal({
  title,
  action,
  fields,
  initial = {},
  onClose,
  onSaved,
  description,
  transform,
  submit = 'Guardar',
  extraContent,
}: {
  title: string;
  action: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
  description?: string;
  transform?: (data: Record<string, unknown>) => Record<string, unknown>;
  submit?: string;
  extraContent?: ReactNode;
}) {
  const ctx = useWorkspace();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        initial[f.name] ?? f.default ?? (f.type === 'checkbox' ? false : ''),
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const request = useRef({ body: '', id: crypto.randomUUID() });
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form
        onInvalidCapture={(e) => {
          const el = e.target as HTMLInputElement;
          setFieldErrors((v) => ({
            ...v,
            [el.getAttribute('aria-label') || '']: 'Completa este campo con un valor válido.',
          }));
        }}
        onChange={() => setFieldErrors({})}
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError('');
          setFieldErrors({});
          try {
            let data = { ...initial, ...values };
            for (const f of fields) {
              if (f.type === 'number')
                data[f.name] = values[f.name] === '' ? undefined : Number(values[f.name]);
            }
            if (transform) data = transform(data);
            const body = JSON.stringify(data);
            if (request.current.body !== body) request.current = { body, id: crypto.randomUUID() };
            await command(ctx.business!.id, action, data, request.current.id);
            onSaved();
            onClose();
          } catch (err) {
            setError((err as Error).message);
            if (err instanceof ApiError) setFieldErrors(err.fields);
          } finally {
            setPending(false);
          }
        }}
      >
        {description && <p className="muted">{description}</p>}
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.name}
              className={
                f.type === 'textarea' ? 'span-two' : f.type === 'checkbox' ? 'check-field' : ''
              }
            >
              {f.type === 'checkbox' ? (
                <>
                  <input
                    aria-label={f.label}
                    type="checkbox"
                    checked={Boolean(values[f.name])}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
                  />
                  {f.label}
                </>
              ) : (
                <>
                  {f.label}
                  {f.required && (
                    <span className="required" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  )}
                  {f.type === 'select' ? (
                    <select
                      aria-label={f.label}
                      required={f.required}
                      value={str(values[f.name])}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    >
                      <option value="">Seleccionar…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'resource' ? (
                    <ResourceInput
                      field={f}
                      value={str(values[f.name])}
                      onChange={(v) => setValues({ ...values, [f.name]: v })}
                    />
                  ) : f.type === 'textarea' ? (
                    <textarea
                      aria-label={f.label}
                      required={f.required}
                      value={str(values[f.name])}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input
                      aria-label={f.label}
                      type={f.type || 'text'}
                      required={f.required}
                      value={str(values[f.name])}
                      min={f.min}
                      max={f.max}
                      step={f.step || '0.01'}
                      inputMode={f.type === 'number' ? 'decimal' : undefined}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                </>
              )}
              {f.hint && <small>{f.hint}</small>}
              {(fieldErrors[f.name] || fieldErrors[f.label]) && (
                <small role="alert" className="error">
                  {fieldErrors[f.name] || fieldErrors[f.label]}
                </small>
              )}
            </label>
          ))}
        </div>
        {extraContent}
        {error && <Notice error>{error}</Notice>}
        <footer className="modal-footer">
          <button type="button" className="button secondary" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? 'Guardando…' : submit}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export const options = (rows: Row[]) => rows.map((r) => ({ value: str(r.id), label: str(r.name) }));
export function dateToday(timezone = 'America/Managua') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export const frequencyOptions = [
  { value: 'weekly', label: 'Cada 7 días' },
  { value: 'fortnightly', label: 'Cada 14 días' },
  { value: 'monthly', label: 'Mensual, mismo día' },
];
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Children.map(children, (row) => {
            if (!isValidElement<{ children?: ReactNode }>(row)) return row;
            return cloneElement(
              row,
              {},
              Children.map(row.props.children, (cell, index) =>
                isValidElement(cell)
                  ? cloneElement(cell as ReactElement<Record<string, unknown>>, {
                      'data-label': head[index],
                    })
                  : cell,
              ),
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function Status({ value }: { value: unknown }) {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    confirmed: 'Confirmado',
    void: 'Anulado',
    sent: 'Enviada',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    expired: 'Vencida',
    received: 'Recibida',
    review: 'En revisión',
    resolved: 'Resuelta',
    active: 'Activo',
    suspended: 'Suspendido',
  };
  return <span className={`status status-${str(value)}`}>{labels[str(value)] || str(value)}</span>;
}
