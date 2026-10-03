import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    new URL(request.headers.get('origin')!).host !== request.headers.get('host')
  )
    return NextResponse.json({ error: 'Solicitud no autorizada.' }, { status: 403 });
  try {
    const body = await request.json();
    const db = await serverClient();
    const { data, error } = await db.rpc('platform', {
      p_action: body.action,
      p_data: body.data || {},
    });
    if (error)
      return NextResponse.json(
        {
          error: error.message.startsWith('APP:') ? error.message.slice(4) : 'No se pudo guardar.',
        },
        { status: 403 },
      );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar.' }, { status: 503 });
  }
}
