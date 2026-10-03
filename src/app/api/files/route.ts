import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { z } from 'zod';
import sharp from 'sharp';
export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    new URL(request.headers.get('origin')!).host !== request.headers.get('host')
  )
    return NextResponse.json({ error: 'Solicitud no autorizada.' }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    const business = z.uuid().parse(form.get('business'));
    const folder = z.enum(['photos', 'documents', 'deliveries']).parse(form.get('folder'));
    if (!(file instanceof File) || file.size > 5242880 || file.size === 0)
      return NextResponse.json({ error: 'Usa un archivo de hasta 5 MB.' }, { status: 400 });
    let bytes = new Uint8Array(await file.arrayBuffer());
    let type = '';
    let ext = '';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      type = 'image/jpeg';
      ext = 'jpg';
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      type = 'image/png';
      ext = 'png';
    } else if (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    ) {
      type = 'image/webp';
      ext = 'webp';
    } else if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') {
      type = 'application/pdf';
      ext = 'pdf';
    }
    if (!type || (folder === 'photos' && type === 'application/pdf'))
      return NextResponse.json(
        {
          error: 'Usa una fotografía JPG, PNG o WebP; los comprobantes admiten también PDF.',
        },
        { status: 400 },
      );
    if (folder === 'photos') {
      const image = await sharp(bytes, { limitInputPixels: 24000000 })
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      bytes = new Uint8Array(image);
      type = 'image/webp';
      ext = 'webp';
    }
    const db = await serverClient();
    const path = `${business}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage
      .from('business-files')
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error)
      return NextResponse.json(
        { error: 'No se pudo subir el archivo. Revisa tus permisos.' },
        { status: 400 },
      );
    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el archivo.' }, { status: 400 });
  }
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    const db = await serverClient();
    const { data, error } = await db.storage.from('business-files').createSignedUrl(path, 60);
    if (error) return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 403 });
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: 'Archivo no disponible.' }, { status: 403 });
  }
}
