'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Modal, Notice, Table, str, dateToday } from './ui';
import type { Row } from '@/lib/types';
export function PlatformBilling({ business, onClose }: { business: Row; onClose: () => void }) {
  const [data, setData] = useState<{ subscription: Row | null; payments: Row[] }>({
    subscription: null,
    payments: [],
  });
  const [mode, setMode] = useState('subscription');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    api<typeof data>('/api/platform', {
      method: 'POST',
      body: JSON.stringify({ action: 'detail', data: { business_id: business.id } }),
    })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [business.id, version]);
  return (
    <Modal title={`Servicio · ${business.name}`} onClose={onClose}>
      <div className="document-detail">
        <p className="muted">
          Registro administrativo de suscripción y cobros del servicio. No procesa pagos con una
          pasarela externa.
        </p>
        <div className="tabs">
          <button
            className={mode === 'subscription' ? 'active' : ''}
            onClick={() => setMode('subscription')}
          >
            Suscripción
          </button>
          <button
            className={mode === 'service_payment' ? 'active' : ''}
            onClick={() => setMode('service_payment')}
          >
            Pagos del servicio
          </button>
        </div>
        {data.subscription && (
          <p>
            Plan {str(data.subscription.plan)} · {str(data.subscription.status)} · hasta{' '}
            {str(data.subscription.ends_on)}
          </p>
        )}
        {error && <Notice error>{error}</Notice>}
        <form
          key={mode + version}
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError('');
            const f = new FormData(e.currentTarget);
            const payload = {
              ...Object.fromEntries(f),
              business_id: business.id,
              id: key,
              amount: Number(f.get('amount')),
            };
            try {
              await api('/api/platform', {
                method: 'POST',
                body: JSON.stringify({ action: mode, data: payload }),
              });
              setVersion((v) => v + 1);
              setKey(crypto.randomUUID());
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="form-grid">
            {mode === 'subscription' ? (
              <>
                <label>
                  Plan
                  <input name="plan" required defaultValue={str(data.subscription?.plan)} />
                </label>
                <label>
                  Estado
                  <select name="status" defaultValue={str(data.subscription?.status) || 'trial'}>
                    <option value="trial">Prueba</option>
                    <option value="active">Activo</option>
                    <option value="expired">Vencido</option>
                    <option value="canceled">Cancelado</option>
                  </select>
                </label>
                <label>
                  Desde
                  <input
                    name="starts_on"
                    type="date"
                    required
                    defaultValue={str(data.subscription?.starts_on) || dateToday()}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    name="ends_on"
                    type="date"
                    required
                    defaultValue={str(data.subscription?.ends_on) || dateToday()}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Fecha de cobro
                  <input name="paid_on" type="date" required defaultValue={dateToday()} />
                </label>
                <label>
                  Referencia
                  <input name="reference" required />
                </label>
              </>
            )}
            <label>
              Importe
              <input
                type="number"
                name="amount"
                step="0.01"
                min={mode === 'subscription' ? 0 : 0.01}
                required
                defaultValue={mode === 'subscription' ? str(data.subscription?.amount) : ''}
              />
            </label>
          </div>
          <button className="button primary" disabled={pending}>
            {pending
              ? 'Guardando…'
              : mode === 'subscription'
                ? 'Guardar suscripción'
                : 'Registrar cobro'}
          </button>
        </form>
        {mode === 'service_payment' && (
          <Table head={['Fecha', 'Importe', 'Referencia']}>
            {data.payments.map((p) => (
              <tr key={str(p.id)}>
                <td>{str(p.paid_on)}</td>
                <td>{str(p.amount)}</td>
                <td>{str(p.reference)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Modal>
  );
}
