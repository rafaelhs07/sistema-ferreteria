import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadDocument } from '@/lib/document';
import { formatMoney } from '@/lib/money';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const {
      document: d,
      lines,
      business: b,
      balance,
      party,
    } = await loadDocument(
      url.searchParams.get('business') || '',
      url.searchParams.get('id') || '',
    );
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const width = b.receipt_format === '80mm' ? 226 : 595;
    const margin = width === 226 ? 12 : 45;
    let page = pdf.addPage([width, 842]);
    let y = 790;
    const text = (v: unknown) => String(v ?? '').replace(/[^\x20-\x7e\xa0-\xff]/g, ' ');
    const write = (v: unknown, size = 11, weight = false) => {
      if (y < 55) {
        page = pdf.addPage([width, 842]);
        y = 790;
      }
      const s = text(v);
      const face = weight ? bold : font;
      for (let i = 0; i < s.length;) {
        let end = i + 1;
        while (
          end < s.length &&
          face.widthOfTextAtSize(s.slice(i, end + 1), size) <= width - 2 * margin
        )
          end++;
        if (y < 55) {
          page = pdf.addPage([width, 842]);
          y = 790;
        }
        page.drawText(s.slice(i, end), {
          x: margin,
          y,
          size,
          font: face,
          color: rgb(0.12, 0.2, 0.18),
        });
        y -= size + 7;
        i = end;
      }
    };
    const money = (v: unknown) => formatMoney(String(v || 0), String(b.currency));
    write(b.name, 23, true);
    write(`${b.tax_id || ''} · ${b.phone || ''}`);
    write(b.address);
    y -= 12;
    write(
      `${d.kind === 'quote' ? 'Cotización' : d.kind === 'purchase' ? 'Orden de compra' : 'Comprobante de venta'} #${d.number_prefix || ''}${d.number}`,
      16,
      true,
    );
    write(
      `${new Date(String(d.created_at)).toLocaleString('es-NI', { timeZone: String(b.timezone) })} · ${d.state}`,
    );
    y -= 15;
    write(
      `${d.kind === 'purchase' ? 'Proveedor' : 'Cliente'}: ${party?.name || (d.party_id ? 'Contacto registrado' : 'Consumidor final')}`,
    );
    for (const l of lines) {
      write(l.product_name, 11, true);
      write(
        `${l.quantity} ${l.presentation_name} · Precio ${money(l.price)} · Descuento ${money(l.discount)} · Total ${money(l.total)}`,
      );
      if (l.serial) write(`Serie: ${l.serial}`);
      y -= 8;
    }
    y -= 12;
    write(`Subtotal neto: ${money(d.subtotal)}`);
    write(`Impuestos: ${money(d.tax)}`);
    write(`Transporte: ${money(d.transport)}`);
    if (Number(d.extra_cost) > 0) write(`Costos adicionales: ${money(d.extra_cost)}`);
    write(`Total: ${money(d.total)}`, 15, true);
    if (balance && d.kind !== 'quote') {
      write(`Pagado neto: ${money(balance.paid)}`);
      write(`Saldo: ${money(balance.balance)}`);
    }
    if (d.valid_until) write(`Vigencia: ${d.valid_until}`);
    if (d.address) write(`Entrega: ${d.address}`);
    if (d.notes) write(d.notes);
    y -= 20;
    write('Comprobante comercial. Sin integración fiscal electrónica.', 9);
    return new NextResponse(new Uint8Array(await pdf.save()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="comprobante-${d.number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Documento no disponible. Comprueba tu sesión y tus permisos.' },
      { status: 403 },
    );
  }
}
