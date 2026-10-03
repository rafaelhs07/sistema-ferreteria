'use client';
import { useState } from 'react';
import Papa from 'papaparse';
import { productSchema } from '@/lib/validation';
import { api, command } from '@/lib/api';
import type { Row } from '@/lib/types';
import { Modal, Notice, Table, useWorkspace, str } from './ui';
type ImportRow = {
  data: Record<string, unknown>;
  error: string;
  status: string;
  key: string;
};
export function ImportProducts({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const ctx = useWorkspace();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  async function read(file: File) {
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo debe pesar menos de 5 MB.');
      return;
    }
    try {
      let input: Record<string, unknown>[] = [];
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('El archivo no contiene hojas.');
        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, col) => (headers[col - 1] = String(cell.value || '')));
        sheet.eachRow((row, i) => {
          if (i === 1) return;
          const out: Record<string, unknown> = {};
          headers.forEach((h, j) => {
            const value = row.getCell(j + 1).value;
            if (value && typeof value === 'object')
              throw new Error('Usa valores simples, sin fórmulas ni enlaces, en la importación.');
            out[h] = value ?? '';
          });
          input.push(out);
        });
      } else {
        const parsed = Papa.parse<Record<string, string>>(await file.text(), {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length)
          throw new Error('No se pudo leer el CSV. Revisa los encabezados y separadores.');
        input = parsed.data;
      }
      if (input.length > 1000) throw new Error('Importa hasta 1,000 productos por archivo.');
      const codes = new Set<string>();
      const barcodes = new Set<string>();
      const validated = input.map((r) => {
        const data = {
          ...r,
          unit: r.unit || 'unidad',
          minimum: r.minimum || 0,
          fractional: ['true', '1', 'sí', 'si'].includes(str(r.fractional).toLowerCase()),
          barcode: r.barcode || '',
          category: r.category || '',
          brand: r.brand || '',
          description: r.description || '',
          price: r.price,
          cost: 0,
        };
        const valid = productSchema.safeParse(data);
        let error = valid.success
          ? ''
          : valid.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        const code = str(r.code).trim();
        const barcode = str(r.barcode).trim();
        if (codes.has(code) || (barcode && barcodes.has(barcode)))
          error = 'Código o código de barras duplicado dentro del archivo.';
        codes.add(code);
        if (barcode) barcodes.add(barcode);
        return { data, error, status: 'Pendiente', key: crypto.randomUUID() };
      });
      setRows(validated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importRows() {
    setPending(true);
    setError('');
    let count = 0;
    let updated = [...rows];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.error || row.status === 'Importado') continue;
      let status = '';
      try {
        const existing = await api<{ rows: Row[] }>(
          `/api/data?${new URLSearchParams({ business: ctx.business!.id, entity: 'products', q: str(row.data.code) })}`,
        );
        if (existing.rows.some((r) => r.code === str(row.data.code).trim()))
          throw new Error('El código ya existe. La importación no sobrescribe productos.');
        await command(ctx.business!.id, 'product.save', row.data, row.key);
        status = 'Importado';
        count++;
      } catch (e) {
        status = (e as Error).message;
      }
      updated = updated.map((r, j) => (j === i ? { ...r, status } : r));
      setRows(updated);
      setProgress(i + 1);
    }
    setPending(false);
    onSaved();
    if (!count) setError('No se importaron nuevos productos. Revisa el estado de cada fila.');
  }
  return (
    <Modal
      title="Importar productos"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="import-content">
        <p>
          CSV o Excel (.xlsx), hasta 1,000 filas. Encabezados:{' '}
          <code>code,name,price,unit,minimum,fractional,barcode,category,brand,description</code>.
        </p>
        <p className="muted">
          Se validan las filas antes de guardar. Los códigos existentes se reportan y no se
          sobrescriben.
        </p>
        <label>
          Archivo
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
        </label>
        {error && <Notice error>{error}</Notice>}
        {rows.length > 0 && (
          <>
            <p>
              {rows.length} filas · {rows.filter((r) => r.error).length} con errores ·{' '}
              {rows.filter((r) => r.status === 'Importado').length} importadas
            </p>
            <Table head={['Fila', 'Código', 'Producto', 'Precio', 'Validación / estado']}>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={r.key}>
                  <td>{i + 2}</td>
                  <td>{str(r.data.code)}</td>
                  <td>{str(r.data.name)}</td>
                  <td>{str(r.data.price)}</td>
                  <td className={r.error ? 'error' : ''}>{r.error || r.status}</td>
                </tr>
              ))}
            </Table>
            {rows.length > 100 && (
              <p>Vista previa de las primeras 100 filas. Todas se validan y procesan.</p>
            )}
            <button
              className="button primary"
              disabled={pending || rows.every((r) => r.error)}
              onClick={importRows}
            >
              {pending ? `Importando ${progress}/${rows.length}…` : 'Importar filas válidas'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
export async function exportProducts(business: string, format: 'csv' | 'xlsx' = 'csv') {
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    const data = await api<{ rows: Row[]; count: number }>(
      `/api/export?${new URLSearchParams({ business, page: String(page) })}`,
    );
    rows.push(...data.rows);
    if (rows.length >= data.count) break;
  }
  const csv = Papa.unparse(
    rows.map((r) =>
      Object.fromEntries(
        [
          'code',
          'name',
          'price',
          'unit',
          'minimum',
          'fractional',
          'barcode',
          'category',
          'brand',
          'description',
        ].map((k) => [k, r[k] ?? '']),
      ),
    ),
    { escapeFormulae: true },
  );
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  if (format === 'xlsx') {
    URL.revokeObjectURL(url);
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Productos');
    const columns = [
      'code',
      'name',
      'price',
      'unit',
      'minimum',
      'fractional',
      'barcode',
      'category',
      'brand',
      'description',
    ];
    sheet.columns = columns.map((key) => ({ header: key, key, width: key === 'name' ? 32 : 18 }));
    for (const r of rows) sheet.addRow(Object.fromEntries(columns.map((k) => [k, r[k] ?? ''])));
    sheet.getRow(1).font = { bold: true };
    const bytes = await workbook.xlsx.writeBuffer();
    const excelUrl = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const a = document.createElement('a');
    a.href = excelUrl;
    a.download = 'productos.xlsx';
    a.click();
    URL.revokeObjectURL(excelUrl);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'productos.csv';
  a.click();
  URL.revokeObjectURL(url);
}
