'use client';
import { useState } from 'react';
import { command } from '@/lib/api';
import { useWorkspace, Notice } from './ui';
export function FileUpload({
  id,
  folder = 'photos',
  action = 'product.attach',
  onSaved,
  label,
}: {
  id: string;
  folder?: 'photos' | 'documents' | 'deliveries';
  action?: string;
  onSaved: () => void;
  label?: string;
}) {
  const ctx = useWorkspace();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <div>
      <label>
        {label || (folder === 'photos' ? 'Fotografía del producto' : 'Comprobante adjunto')}
        <input
          type="file"
          accept={
            folder === 'photos'
              ? 'image/jpeg,image/png,image/webp'
              : 'image/jpeg,image/png,image/webp,application/pdf'
          }
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPending(true);
            setError('');
            setMessage('');
            try {
              const form = new FormData();
              form.set('file', file);
              form.set('business', ctx.business!.id);
              form.set('folder', folder);
              const res = await fetch('/api/files', {
                method: 'POST',
                body: form,
              });
              const out = await res.json();
              if (!res.ok) throw new Error(out.error);
              await command(ctx.business!.id, action, { id, path: out.path });
              setMessage('Archivo guardado.');
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        />
      </label>
      {pending && <small>Subiendo archivo…</small>}
      {message && (
        <small className="success" role="status">
          {message}
        </small>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
