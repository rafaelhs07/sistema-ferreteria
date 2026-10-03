'use client';
import { useState } from 'react';
import {
  useData,
  useWorkspace,
  Table,
  Pagination,
  Notice,
  Loading,
  Empty,
  FormModal,
  str,
  Modal,
} from './ui';
import { FileUpload } from './file-upload';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/types';
const states: Record<string, string> = {
  received: 'Recibido',
  review: 'En revisión',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
};
export function DocumentHistory({ document, onSaved }: { document: Row; onSaved: () => void }) {
  const ctx = useWorkspace();
  const [tab, setTab] = useState('payments');
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Row | null>(null);
  const [attachment, setAttachment] = useState<Row | null>(null);
  const data = useData(tab, { document_id: str(document.id), page: String(page) });
  return (
    <section>
      <h3>Seguimiento y comprobantes</h3>
      <div className="tabs">
        {[
          ['payments', 'Pagos y recibos'],
          ['returns', 'Devoluciones'],
          ...(document.kind === 'sale'
            ? [
                ['deliveries', 'Entregas'],
                ['warranties', 'Garantías'],
              ]
            : []),
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => {
              setTab(key);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {data.error ? (
        <Notice error>{data.error}</Notice>
      ) : data.loading ? (
        <Loading />
      ) : !data.rows.length ? (
        <Empty
          title="Sin registros en esta sección"
          description="Los movimientos aparecerán después de confirmarlos."
        />
      ) : (
        <Table head={['Fecha', 'Detalle', 'Importe / cantidad', 'Acciones']}>
          {data.rows.map((r) => (
            <tr key={str(r.id)}>
              <td>{str(r.created_at).slice(0, 16).replace('T', ' ')}</td>
              <td>
                {str(r.description || r.contact || r.reason || r.reference) ||
                  (r.direction === 'in' ? 'Entrada' : 'Salida')}
                {r.serial && <small>Serie: {str(r.serial)}</small>}
                {r.state && <small>{states[str(r.state)]}</small>}
              </td>
              <td>
                {r.amount !== undefined
                  ? formatMoney(str(r.amount), ctx.business?.currency)
                  : str(r.quantity)}
              </td>
              <td>
                <div className="row-actions">
                  {tab === 'payments' && (
                    <a
                      className="button compact"
                      href={`/receipt/${r.id}?business=${ctx.business!.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Recibo
                    </a>
                  )}
                  {tab === 'warranties' && ctx.permissions.includes('return.write') && (
                    <button className="button compact" onClick={() => setEdit(r)}>
                      Actualizar caso
                    </button>
                  )}
                  {tab === 'deliveries' && ctx.permissions.includes('delivery.write') && (
                    <button className="button compact" onClick={() => setAttachment(r)}>
                      Adjuntar constancia
                    </button>
                  )}
                  {r.proof_path && (
                    <a
                      className="button compact"
                      href={`/api/files?path=${encodeURIComponent(str(r.proof_path))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver constancia
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={page} count={data.count} onChange={setPage} />
      {edit && (
        <FormModal
          title="Seguimiento de garantía"
          action="warranty.save"
          initial={edit}
          fields={[
            {
              name: 'description',
              label: 'Descripción del seguimiento',
              type: 'textarea',
              required: true,
            },
            {
              name: 'state',
              label: 'Estado',
              type: 'select',
              options: [
                { value: 'received', label: 'Recibido' },
                { value: 'review', label: 'En revisión' },
                { value: 'resolved', label: 'Resuelto' },
                { value: 'rejected', label: 'Rechazado' },
              ],
              required: true,
            },
          ]}
          onClose={() => setEdit(null)}
          onSaved={() => {
            data.refresh();
            onSaved();
          }}
        />
      )}
      {attachment && (
        <Modal title="Constancia de entrega" onClose={() => setAttachment(null)}>
          <div className="document-detail">
            <FileUpload
              id={str(attachment.id)}
              folder="deliveries"
              action="delivery.attach"
              onSaved={data.refresh}
            />
          </div>
        </Modal>
      )}
    </section>
  );
}
