import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validation';
import { z } from 'zod';
export async function POST(request: Request) {
  try {
    if (
      request.headers.get('origin') &&
      new URL(request.headers.get('origin')!).host !== request.headers.get('host')
    )
      return NextResponse.json({ error: 'Solicitud no autorizada.' }, { status: 403 });
    const input = await request.json();
    const db = await serverClient();
    if (input.action === 'logout') {
      await db.auth.signOut({ scope: 'local' });
      const jar = await cookies();
      const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
      for (const cookie of jar.getAll())
        if (cookie.name.startsWith(`sb-${ref}-`)) jar.delete(cookie.name);
      jar.delete('business');
      return NextResponse.json({ ok: true });
    }
    if (input.action === 'switch') {
      const id = z.uuid().parse(input.id);
      const { data: identity } = await db.auth.getUser();
      if (!identity.user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
      const { data } = await db
        .from('memberships')
        .select('business_id')
        .eq('business_id', id)
        .eq('user_id', identity.user.id)
        .eq('active', true)
        .maybeSingle();
      if (!data)
        return NextResponse.json({ error: 'No tienes acceso a ese negocio.' }, { status: 403 });
      (await cookies()).set('business', id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return NextResponse.json({ ok: true });
    }
    if (input.action === 'bootstrap') {
      const name = z.string().trim().min(1).max(200).parse(input.name);
      const { data, error } = await db.rpc('bootstrap', {
        p_name: name,
        p_key: z.uuid().parse(input.key),
      });
      if (error)
        return NextResponse.json(
          { error: 'No se pudo crear el negocio. Comprueba tu sesión.' },
          { status: 400 },
        );
      (await cookies()).set('business', data, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return NextResponse.json({ ok: true });
    }
    const valid = loginSchema.safeParse(input);
    if (!valid.success)
      return NextResponse.json(
        {
          error: 'Ingresa un correo válido y una contraseña de al menos ocho caracteres.',
        },
        { status: 400 },
      );
    if (input.action === 'signup') {
      const { error } = await db.auth.signUp({
        ...valid.data,
        options: {
          emailRedirectTo: new URL('/auth/callback', request.url).toString(),
        },
      });
      if (error)
        return NextResponse.json(
          {
            error: 'No se pudo crear la cuenta. Revisa el correo y las reglas de contraseña.',
          },
          { status: 400 },
        );
      return NextResponse.json({
        message: 'Revisa tu correo para confirmar la cuenta y luego inicia sesión.',
      });
    }
    const { error } = await db.auth.signInWithPassword(valid.data);
    if (error)
      return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar. Vuelve a intentar.' }, { status: 503 });
  }
}
