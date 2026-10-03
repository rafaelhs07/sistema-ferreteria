'use client';
import { useState } from 'react';
import { Modal, FormModal, Table, useData, Pagination, str, Notice } from './ui';
export function CatalogSettings({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState('units');
  const [page, setPage] = useState(0);
  const [add, setAdd] = useState(false);
  const data = useData(kind, { page: String(page) });
  return (
    <>
      <Modal title="Unidades, categorías y marcas" onClose={onClose}>
        <div className="document-detail">
          <div className="tabs">
            {[
              ['units', 'Unidades'],
              ['categories', 'Categorías'],
              ['brands', 'Marcas'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={kind === key ? 'active' : ''}
                onClick={() => {
                  setKind(key);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted">
            Los nombres usados por productos también se registran aquí. Las conversiones se
            configuran en las presentaciones de cada producto.
          </p>
          <button className="button primary" onClick={() => setAdd(true)}>
            Agregar nombre
          </button>
          {data.error && <Notice error>{data.error}</Notice>}
          <Table head={['Nombre']}>
            {data.rows.map((r) => (
              <tr key={str(r.id)}>
                <td>{str(r.name) || 'Sin especificar'}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </div>
      </Modal>
      {add && (
        <FormModal
          title="Agregar nombre"
          action="catalog.save"
          initial={{ kind }}
          fields={[{ name: 'name', label: 'Nombre', required: true }]}
          onClose={() => setAdd(false)}
          onSaved={data.refresh}
        />
      )}
    </>
  );
}
