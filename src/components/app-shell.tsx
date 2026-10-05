'use client';
import { useEffect, useState } from 'react';
import {
  Hammer,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Warehouse,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Plus,
  MoreHorizontal,
  FileText,
  Shield,
  Menu,
  WifiOff,
  PanelLeft,
} from 'lucide-react';
import type { Context, Row } from '@/lib/types';
import { WorkspaceContext } from './ui';
import { api } from '@/lib/api';
import { Dashboard } from './dashboard';
import { Catalog, Parties, Inventory, Expenses, Cash, SettingsScreen, Platform } from './modules';
import { PointOfSale } from './point-of-sale';
import { Documents } from './documents';
const navigation = [
  {
    key: 'home',
    label: 'Inicio',
    icon: LayoutDashboard,
    permission: 'read',
    group: 'MI NEGOCIO',
  },
  {
    key: 'sell',
    label: 'Punto de venta',
    icon: ShoppingCart,
    permission: 'sale.create',
    group: '',
  },
  {
    key: 'sales',
    label: 'Ventas',
    icon: Receipt,
    permission: 'documents.read',
    group: '',
  },
  {
    key: 'quotes',
    label: 'Cotizaciones',
    icon: FileText,
    permission: 'quote.write',
    group: '',
  },
  {
    key: 'products',
    label: 'Productos',
    icon: Package,
    permission: 'products.read',
    group: 'CATÁLOGO Y EXISTENCIAS',
  },
  {
    key: 'inventory',
    label: 'Inventario',
    icon: Warehouse,
    permission: 'inventory.read',
    group: '',
  },
  {
    key: 'purchases',
    label: 'Compras',
    icon: Truck,
    permission: 'purchase.receive',
    group: '',
  },
  {
    key: 'customers',
    label: 'Clientes',
    icon: Users,
    permission: 'parties.read',
    group: 'CUENTAS Y OPERACIÓN',
  },
  {
    key: 'suppliers',
    label: 'Proveedores',
    icon: Truck,
    permission: 'parties.read',
    group: '',
  },
  {
    key: 'cash',
    label: 'Caja y bancos',
    icon: Wallet,
    permission: 'money.read',
    group: '',
  },
  {
    key: 'expenses',
    label: 'Gastos y empleados',
    icon: Receipt,
    permission: 'expense.write',
    group: '',
  },
  {
    key: 'deliveries',
    label: 'Entregas',
    icon: Truck,
    permission: 'delivery.write',
    group: '',
  },
  {
    key: 'reports',
    label: 'Reportes',
    icon: BarChart3,
    permission: 'report.read',
    group: 'ADMINISTRACIÓN',
  },
  {
    key: 'settings',
    label: 'Configuración',
    icon: Settings,
    permission: 'settings.write',
    group: '',
  },
];
export function AppShell({ context, settings }: { context: Context; settings: Row }) {
  const [tab, setTab] = useState('home');
  const [more, setMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [branch, setBranch] = useState(String(context.branches[0]?.id || ''));
  const [logoutError, setLogoutError] = useState('');
  const allowed = (p: string) => p === 'read' || context.permissions.includes(p);
  const nav = navigation.filter(
    (n) => allowed(n.permission) || (n.key === 'purchases' && allowed('purchase.write')),
  );
  useEffect(() => {
    const sync = () => {
      const t = new URLSearchParams(location.search).get('tab') || 'home';
      setTab(t);
    };
    sync();
    addEventListener('popstate', sync);
    const online = () => setOffline(!navigator.onLine);
    online();
    addEventListener('online', online);
    addEventListener('offline', online);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      removeEventListener('popstate', sync);
      removeEventListener('online', online);
      removeEventListener('offline', online);
    };
  }, []);
  const go = (key: string) => {
    setTab(key);
    setMore(false);
    history.pushState(null, '', `/?tab=${key}`);
    window.scrollTo(0, 0);
  };
  const title =
    nav.find((n) => n.key === tab)?.label ||
    (tab === 'platform' ? 'Administración de plataforma' : 'Inicio');
  let content;
  if (context.business?.status === 'suspended')
    content = (
      <div className="panel empty">
        <Shield size={32} />
        <h1>El acceso a este negocio está suspendido</h1>
        <p>
          Los datos se conservan. Contacta al administrador del servicio para revisar el acceso.
        </p>
      </div>
    );
  else if (tab === 'platform' && context.superadmin) content = <Platform />;
  else if (!context.business) content = <Platform />;
  else if (!nav.some((n) => n.key === tab))
    content = (
      <div className="panel empty">
        <h2>No tienes permiso para abrir esta sección</h2>
        <button className="button primary" onClick={() => go('home')}>
          Volver al inicio
        </button>
      </div>
    );
  else if (tab === 'home' || tab === 'reports')
    content = <Dashboard branch={branch} reports={tab === 'reports'} onNavigate={go} />;
  else if (tab === 'sell') content = <PointOfSale key={branch} branch={branch} />;
  else if (tab === 'products') content = <Catalog />;
  else if (tab === 'customers' || tab === 'suppliers')
    content = <Parties kind={tab === 'customers' ? 'customer' : 'supplier'} branch={branch} />;
  else if (tab === 'inventory') content = <Inventory branch={branch} />;
  else if (tab === 'cash') content = <Cash branch={branch} />;
  else if (tab === 'expenses') content = <Expenses branch={branch} />;
  else if (tab === 'settings') content = <SettingsScreen settings={settings} />;
  else
    content = (
      <Documents
        kind={tab === 'purchases' ? 'purchase' : tab === 'quotes' ? 'quote' : 'sale'}
        branch={branch}
        deliveries={tab === 'deliveries'}
      />
    );
  return (
    <WorkspaceContext.Provider value={context}>
      <a href="#main" className="skip-link">
        Ir al contenido
      </a>
      <div className="app-layout">
        <aside className={`sidebar ${more ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
          <button className="brand" onClick={() => go('home')} aria-label="Ferro, inicio">
            <span className="brand-icon">
              <Hammer size={23} />
            </span>
            <span>
              ferro<span className="brand-dot">.</span>
            </span>
          </button>
          <div className="business-tag">
            <span className="avatar">{context.business?.name.slice(0, 1) || 'F'}</span>
            <div>
              <strong>{context.business?.name || 'Plataforma'}</strong>
              <small>Gestión de ferretería</small>
            </div>
          </div>
          <nav aria-label="Menú principal">
            {nav.map((n) => (
              <div key={n.key}>
                {n.group && <div className="nav-group">{n.group}</div>}
                <button
                  className={tab === n.key ? 'nav-item active' : 'nav-item'}
                  onClick={() => go(n.key)}
                  title={n.label}
                >
                  <n.icon size={19} />
                  <span>{n.label}</span>
                  {tab === n.key && <span className="nav-mark" />}
                </button>
              </div>
            ))}
            {context.superadmin && (
              <button
                className={tab === 'platform' ? 'nav-item active' : 'nav-item'}
                onClick={() => go('platform')}
                title="Plataforma"
              >
                <Shield size={19} />
                <span>Plataforma</span>
                {tab === 'platform' && <span className="nav-mark" />}
              </button>
            )}
          </nav>
          <div className="sidebar-bottom">
            <span className="online-dot" /> <span className="sidebar-caption">Tu operación, en orden</span>
          </div>
        </aside>
        {more && (
          <button
            className="sidebar-overlay"
            aria-label="Cerrar menú"
            onClick={() => setMore(false)}
          />
        )}
        <div className={`workspace ${collapsed ? 'expanded-workspace' : ''}`}>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-only"
                aria-label="Abrir menú"
                onClick={() => setMore(true)}
              >
                <Menu />
              </button>
              <button
                className="sidebar-toggle-btn"
                aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
                title={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
                onClick={() => setCollapsed(!collapsed)}
              >
                <PanelLeft size={18} />
              </button>
              <span className="muted">{tab === 'platform' ? 'Plataforma' : (context.business?.name || 'Mi negocio')}</span>
              <span>/</span>
              <strong>{title}</strong>
            </div>
            <div className="topbar-actions">
              {context.businesses.length > 1 && (
                <select
                  aria-label="Cambiar negocio"
                  value={context.business?.id}
                  onChange={async (e) => {
                    try {
                      setLogoutError('');
                      await api('/api/auth', {
                        method: 'POST',
                        body: JSON.stringify({
                          action: 'switch',
                          id: e.target.value,
                        }),
                      });
                      sessionStorage.clear();
                      location.assign(new URL('/', location.origin).href);
                    } catch (error) {
                      setLogoutError(
                        error instanceof Error
                          ? error.message
                          : 'No se pudo cambiar de negocio. Intenta nuevamente.',
                      );
                    }
                  }}
                >
                  {context.businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              {context.branches.length > 0 && (
                <label className="branch-select">
                  <Warehouse size={16} />
                  <select
                    aria-label="Sucursal"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  >
                    {context.branches.map((b) => (
                      <option key={String(b.id)} value={String(b.id)}>
                        {String(b.name)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
              )}
              <div
                className="user-badge"
                title={`${context.user.email} · ${context.business?.role || (context.superadmin ? 'SUPER_ADMIN' : 'USUARIO')}`}
              >
                <span className="avatar user">{context.user.email.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{context.user.email.split('@')[0]}</strong>
                  <span className="user-role-chip">{context.business?.role || (context.superadmin ? 'SUPER_ADMIN' : 'USUARIO')}</span>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={async () => {
                  try {
                    await api('/api/auth', {
                      method: 'POST',
                      body: JSON.stringify({ action: 'logout' }),
                    });
                    sessionStorage.clear();
                    location.assign(new URL('/', location.origin).href);
                  } catch (e) {
                    setLogoutError((e as Error).message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          {tab === 'platform' && (
            <div className="platform-banner" role="region" aria-label="Modo superadmin">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} />
                <span>Panel SUPER_ADMIN · Control global de la plataforma, licencias y suscripciones</span>
              </div>
              <span className="platform-badge">SUPER_ADMIN</span>
            </div>
          )}
          {offline && (
            <div className="connection-banner" role="status">
              <WifiOff size={18} />
              Sin conexión. Puedes conservar un borrador; las operaciones se confirman cuando vuelva
              internet.
            </div>
          )}
          {logoutError && (
            <div className="connection-banner error" role="alert">
              {logoutError}
            </div>
          )}
          <main id="main" className="main-content">
            {content}
          </main>
          <footer className="workspace-footer">
            <span>Ferro · Gestión de ferretería</span>
            <span className="muted">
              {context.business?.currency} · {context.business?.timezone}
            </span>
          </footer>
        </div>
        <nav className="bottom-nav" aria-label="Navegación móvil">
          {[
            { key: 'home', label: 'Inicio', icon: LayoutDashboard },
            { key: 'sell', label: 'Vender', icon: Plus },
            { key: 'products', label: 'Productos', icon: Package },
          ]
            .filter((n) => nav.some((x) => x.key === n.key))
            .map((n) => (
              <button
                key={n.key}
                className={tab === n.key ? 'active' : ''}
                onClick={() => go(n.key)}
              >
                <n.icon size={22} />
                {n.label}
              </button>
            ))}
          <button className={more ? 'active' : ''} onClick={() => setMore(!more)}>
            <MoreHorizontal size={22} />
            Más
          </button>
        </nav>
      </div>
    </WorkspaceContext.Provider>
  );
}
