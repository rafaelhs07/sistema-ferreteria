import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { serverClient } from '@/lib/supabase/server';
import { commandSchema, documentSchema, productSchema } from '@/lib/validation';

export async function POST(request: Request) {
  const h = await headers();
  if (h.get('origin') && new URL(h.get('origin')!).host !== h.get('host'))
    return NextResponse.json({ error: 'Solicitud no autorizada.' }, { status: 403 });
  if (Number(h.get('content-length') || 0) > 250000)
    return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
  try {
    const parsed = commandSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: 'Revisa los datos del formulario.',
          fields: parsed.error.flatten(),
        },
        { status: 400 },
      );
    const input = parsed.data;
    if (input.action === 'document.create') {
      const valid = documentSchema.safeParse(input.data);
      if (!valid.success)
        return NextResponse.json(
          {
            error: 'Revisa los campos indicados.',
            fields: Object.fromEntries(
              valid.error.issues.map((i) => [i.path.join('.'), 'Revisa este dato y su formato.']),
            ),
          },
          { status: 400 },
        );
      input.data = valid.data;
    }
    if (input.action === 'product.save') {
      const valid = productSchema.safeParse(input.data);
      if (!valid.success)
        return NextResponse.json(
          {
            error: 'Revisa los campos indicados.',
            fields: Object.fromEntries(
              valid.error.issues.map((i) => [i.path.join('.'), 'Revisa este dato y su formato.']),
            ),
          },
          { status: 400 },
        );
      input.data = { ...input.data, ...valid.data };
    }
    const db = await serverClient();
    const { data: identity, error: authError } = await db.auth.getUser();
    if (authError || !identity.user)
      return NextResponse.json({ error: 'Tu sesión terminó. Inicia sesión.' }, { status: 401 });
    const { data, error } = await db.rpc('command', {
      p_business: input.business_id,
      p_key: input.request_id,
      p_action: input.action,
      p_data: input.data,
    });
    if (error) {
      const safe = error.message.startsWith('APP:')
        ? error.message.slice(4)
        : error.code === '23505'
          ? 'Este código ya existe. Usa uno diferente.'
          : 'No se pudo guardar. Revisa los datos y vuelve a intentar.';
      return NextResponse.json({ error: safe }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        error: 'No se pudo conectar. Conservamos los datos para que vuelvas a intentar.',
      },
      { status: 503 },
    );
  }
}
