'use client';
import { useState, useSyncExternalStore } from 'react';
import { Hammer, ArrowRight, ShieldCheck, Package, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
const subscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function AuthScreen({ configured }: { configured: boolean }) {
  const hydrated = useHydrated();
  const [signup, setSignup] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Hammer size={24} />
          </span>{' '}
          ferro<span className="brand-dot">.</span>
        </div>
        <span className="eyebrow">TU NEGOCIO, EN ORDEN</span>
        <h1>
          Más control.
          <br />
          Menos vueltas.
        </h1>
        <p>
          De la primera compra al cierre de caja. Todo lo que pasa en tu ferretería, en un solo
          lugar.
        </p>
        <div className="story-features">
          <span>
            <Package /> Existencias claras
          </span>
          <span>
            <Wallet /> Cuentas al día
          </span>
          <span>
            <ShieldCheck /> Cada operación protegida
          </span>
        </div>
        <div className="story-footer">HECHO PARA EL TRABAJO DE CADA DÍA</div>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="eyebrow">BIENVENIDO A FERRO</span>
          <h2>{signup ? 'Crea tu cuenta' : 'Abre tu negocio'}</h2>
          <p className="muted">
            {signup
              ? 'Confirma tu correo para comenzar de forma segura.'
              : 'Inicia sesión para continuar con tu jornada.'}
          </p>
          {!configured ? (
            <div className="notice">
              <h3>Conecta tu base de datos</h3>
              <p>
                Configura las variables de entorno de Supabase y aplica las migraciones. Las
                instrucciones están en el archivo README del proyecto.
              </p>
            </div>
          ) : (
            <form
              method="post"
              action="/api/auth"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                setError('');
                setMessage('');
                const f = new FormData(e.currentTarget);
                try {
                  const res = await api<{ message?: string }>('/api/auth', {
                    method: 'POST',
                    body: JSON.stringify({
                      action: signup ? 'signup' : 'login',
                      email: f.get('email'),
                      password: f.get('password'),
                    }),
                  });
                  if (signup) setMessage(res.message || 'Cuenta creada.');
                  else window.location.assign(new URL('/', window.location.origin).href);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setPending(false);
                }
              }}
            >
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@ferreteria.com"
                  required
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}
              <button disabled={pending || !hydrated} className="button primary full">
                {pending ? 'Conectando…' : signup ? 'Crear cuenta' : 'Iniciar sesión'}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSignup(!signup);
                  setError('');
                  setMessage('');
                }}
              >
                {signup ? 'Ya tengo una cuenta' : 'Soy nuevo · Crear cuenta'}
              </button>
            </form>
          )}
          <p className="auth-caption">Acceso seguro · Datos separados por negocio</p>
        </div>
      </section>
    </main>
  );
}
export function SetupScreen({ email }: { email: string }) {
  const hydrated = useHydrated();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <main className="setup">
      <span className="brand-icon">
        <Hammer />
      </span>
      <span className="eyebrow">PRIMER PASO</span>
      <h1>Vamos a organizar tu ferretería</h1>
      <p className="muted">Tu cuenta: {email}. Serás administrador de tu propio negocio.</p>
      <form
        method="post"
        action="/api/auth"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            await api('/api/auth', {
              method: 'POST',
              body: JSON.stringify({
                action: 'bootstrap',
                name: new FormData(e.currentTarget).get('name'),
                key,
              }),
            });
            window.location.assign(new URL('/', window.location.origin).href);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Nombre del negocio
          <input name="name" required maxLength={200} placeholder="Ferretería…" />
        </label>
        <p className="muted">
          Crearemos una sucursal, una bodega y tres cuentas. Puedes ajustarlas después.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={pending || !hydrated} className="button primary">
          {pending ? 'Creando…' : 'Crear mi negocio'}
          <ArrowRight size={18} />
        </button>
      </form>
    </main>
  );
}
