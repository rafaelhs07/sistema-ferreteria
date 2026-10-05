'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Sliders,
  Receipt,
  MapPin,
  Warehouse,
  Wallet,
  Users,
  History,
  Plus,
  Pencil,
  Check,
  AlertCircle,
  Printer,
  Percent,
  Phone,
  Hash,
  DollarSign,
  Clock,
  Layers,
} from 'lucide-react';
import {
  Notice,
  Table,
  FormModal,
  Modal,
  options,
  str,
  useWorkspace,
  useData,
  Pagination,
  type Field,
} from './ui';
import { ModuleHeading, ListState } from './modules';
import { FileUpload } from './file-upload';
import { CatalogSettings } from './catalog-settings';
import { command } from '@/lib/api';
import type { Row } from '@/lib/types';

const COMMON_TIMEZONES = [
  { value: 'America/Managua', label: 'Managua (UTC-6) · Nicaragua' },
  { value: 'America/Guatemala', label: 'Guatemala (UTC-6)' },
  { value: 'America/Costa_Rica', label: 'Costa Rica (UTC-6)' },
  { value: 'America/Tegucigalpa', label: 'Tegucigalpa (UTC-6) · Honduras' },
  { value: 'America/El_Salvador', label: 'El Salvador (UTC-6)' },
  { value: 'America/Panama', label: 'Panamá (UTC-5)' },
  { value: 'America/Bogota', label: 'Bogotá (UTC-5) · Colombia' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (UTC-6)' },
  { value: 'America/Lima', label: 'Lima (UTC-5) · Perú' },
  { value: 'America/Santiago', label: 'Santiago (UTC-4/3) · Chile' },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo (UTC-4)' },
  { value: 'America/Caracas', label: 'Caracas (UTC-4) · Venezuela' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (UTC-3) · Argentina' },
  { value: 'America/Montevideo', label: 'Montevideo (UTC-3) · Uruguay' },
  { value: 'America/La_Paz', label: 'La Paz (UTC-4) · Bolivia' },
  { value: 'America/New_York', label: 'Nueva York (UTC-5/4) · EE.UU.' },
  { value: 'Europe/Madrid', label: 'Madrid (UTC+1/2) · España' },
  { value: 'UTC', label: 'UTC (Tiempo Universal Coordinado)' },
];

export function SettingsScreen({ settings }: { settings: Row }) {
  const ctx = useWorkspace();
  const [activeSection, setActiveSection] = useState('business');
  const [form, setForm] = useState('');
  const [catalogs, setCatalogs] = useState(false);
  const [member, setMember] = useState<Row | null>(null);
  const [auditPage, setAuditPage] = useState(0);

  // Data queries
  const membersResult = useData('memberships');
  const auditResult = useData('audit', { page: String(auditPage) });

  // Form states per editable section
  const [businessForm, setBusinessForm] = useState({
    name: str(settings.name || ctx.business?.name || ''),
    tax_id: str(settings.tax_id || ''),
    phone: str(settings.phone || ''),
    address: str(settings.address || ''),
  });

  const [preferencesForm, setPreferencesForm] = useState({
    currency: str(settings.currency || ctx.business?.currency || 'C$'),
    timezone: str(settings.timezone || ctx.business?.timezone || 'America/Managua'),
  });

  const [salesForm, setSalesForm] = useState({
    receipt_format: str(settings.receipt_format || 'a4'),
    max_discount: Number(settings.max_discount ?? 10),
  });

  // Track initial values to detect unsaved changes
  const [initialBusiness, setInitialBusiness] = useState(businessForm);
  const [initialPreferences, setInitialPreferences] = useState(preferencesForm);
  const [initialSales, setInitialSales] = useState(salesForm);

  // Unsaved changes confirmation dialog
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Saving & Feedback states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-dismiss success notice
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Compute dirty states
  const isBusinessDirty = useMemo(() => {
    return (
      businessForm.name !== initialBusiness.name ||
      businessForm.tax_id !== initialBusiness.tax_id ||
      businessForm.phone !== initialBusiness.phone ||
      businessForm.address !== initialBusiness.address
    );
  }, [businessForm, initialBusiness]);

  const isPreferencesDirty = useMemo(() => {
    return (
      preferencesForm.currency !== initialPreferences.currency ||
      preferencesForm.timezone !== initialPreferences.timezone
    );
  }, [preferencesForm, initialPreferences]);

  const isSalesDirty = useMemo(() => {
    return (
      salesForm.receipt_format !== initialSales.receipt_format ||
      salesForm.max_discount !== initialSales.max_discount
    );
  }, [salesForm, initialSales]);

  const isCurrentSectionDirty = useMemo(() => {
    if (activeSection === 'business') return isBusinessDirty;
    if (activeSection === 'preferences') return isPreferencesDirty;
    if (activeSection === 'sales_docs') return isSalesDirty;
    return false;
  }, [activeSection, isBusinessDirty, isPreferencesDirty, isSalesDirty]);

  // Navigation interceptor for unsaved changes
  function switchSection(targetSection: string) {
    if (targetSection === activeSection) return;
    if (isCurrentSectionDirty) {
      setPendingSection(targetSection);
      setShowDiscardModal(true);
    } else {
      setActiveSection(targetSection);
      setError('');
      setSuccess('');
    }
  }

  function discardAndSwitch() {
    if (activeSection === 'business') setBusinessForm(initialBusiness);
    if (activeSection === 'preferences') setPreferencesForm(initialPreferences);
    if (activeSection === 'sales_docs') setSalesForm(initialSales);
    setShowDiscardModal(false);
    if (pendingSection) {
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
    setError('');
  }

  // Unified save handler that guarantees non-destructive updates to public.businesses
  async function handleSaveSettings(sectionUpdates: Partial<Row>, label: string) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: str(businessForm.name || settings.name || ctx.business?.name || ''),
        currency: str(preferencesForm.currency || settings.currency || 'C$'),
        timezone: str(preferencesForm.timezone || settings.timezone || 'America/Managua'),
        tax_id: str(businessForm.tax_id ?? settings.tax_id ?? ''),
        phone: str(businessForm.phone ?? settings.phone ?? ''),
        address: str(businessForm.address ?? settings.address ?? ''),
        receipt_format: str(salesForm.receipt_format || settings.receipt_format || 'a4'),
        max_discount: Number(salesForm.max_discount ?? settings.max_discount ?? 10),
        ...sectionUpdates,
      };

      if (!payload.name.trim()) {
        throw new Error('El nombre comercial del negocio es obligatorio.');
      }
      if (!payload.currency.trim()) {
        throw new Error('El símbolo de moneda es obligatorio.');
      }
      if (!payload.timezone.trim()) {
        throw new Error('La zona horaria es obligatoria.');
      }

      await command(ctx.business!.id, 'settings.save', payload);
      setSuccess(`${label} guardados correctamente.`);

      // Update baseline to clear dirty state
      if (activeSection === 'business') setInitialBusiness(businessForm);
      if (activeSection === 'preferences') setInitialPreferences(preferencesForm);
      if (activeSection === 'sales_docs') setInitialSales(salesForm);

      setTimeout(() => {
        location.reload();
      }, 700);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Definitions for entity modals (branches, warehouses, accounts, numbering, members)
  const fields: Record<string, Field[]> = {
    branch: [{ name: 'name', label: 'Nombre de sucursal', required: true }],
    warehouse: [
      { name: 'name', label: 'Nombre de bodega', required: true },
      {
        name: 'branch_id',
        label: 'Sucursal a la que pertenece',
        type: 'select',
        required: true,
        options: options(ctx.branches),
      },
    ],
    account: [
      { name: 'name', label: 'Nombre de caja o cuenta', required: true },
      {
        name: 'branch_id',
        label: 'Sucursal vinculada',
        type: 'select',
        required: true,
        options: options(ctx.branches),
      },
      {
        name: 'account_kind',
        label: 'Tipo de medio de pago',
        type: 'select',
        required: true,
        options: [
          { value: 'cash', label: 'Efectivo (Caja mostrador)' },
          { value: 'bank', label: 'Banco / Transferencia' },
          { value: 'card', label: 'Tarjeta (POS / Terminal)' },
        ],
      },
      {
        name: 'commission',
        label: 'Comisión de tarjeta (%)',
        type: 'number',
        min: 0,
        max: 100,
        default: 0,
        hint: 'Aplica únicamente a medios de tipo Tarjeta.',
      },
    ],
    numbering: [
      {
        name: 'kind',
        label: 'Tipo de documento',
        type: 'select',
        required: true,
        options: [
          { value: 'sale', label: 'Ventas (Facturas y tickets)' },
          { value: 'purchase', label: 'Compras' },
          { value: 'quote', label: 'Cotizaciones' },
        ],
      },
      {
        name: 'prefix',
        label: 'Prefijo (opcional)',
        hint: 'Ejemplo: FAC-, COT-, COM-',
      },
      {
        name: 'next_number',
        label: 'Siguiente correlativo a emitir',
        type: 'number',
        step: '1',
        min: 1,
        required: true,
        hint: 'Debe ser mayor que el último número emitido.',
      },
    ],
    member: [
      {
        name: 'email',
        label: 'Correo de la persona',
        type: 'email',
        hint: 'La persona debe crear y confirmar su cuenta antes de asignar acceso.',
      },
      {
        name: 'user_id',
        label: 'ID de usuario de Supabase Auth (UUID)',
        hint: 'Opcional si indicas el correo electrónico.',
      },
      {
        name: 'role',
        label: 'Rol de usuario',
        type: 'select',
        required: true,
        options: ['ADMIN', 'VENDEDOR', 'CAJERO', 'BODEGUERO', 'CONTADOR', 'CONSULTA'].map(
          (value) => ({ value, label: value }),
        ),
      },
      {
        name: 'permissions_text',
        label: 'Permisos especiales adicionales (separados por coma)',
        hint: 'cost.read, price.write, discount.authorize, sale.void, export, report.read…',
      },
      {
        name: 'active',
        label: 'Acceso activo al sistema',
        type: 'checkbox',
        default: true,
      },
    ],
  };

  // Internal sections list
  const SECTIONS = [
    {
      id: 'business',
      label: 'Datos del negocio',
      icon: Building2,
      description: 'Nombre comercial, identificación fiscal, contactos y logotipo.',
      dirty: isBusinessDirty,
    },
    {
      id: 'preferences',
      label: 'Preferencias generales',
      icon: Sliders,
      description: 'Símbolo de moneda, zona horaria y formatos regionales.',
      dirty: isPreferencesDirty,
    },
    {
      id: 'sales_docs',
      label: 'Ventas y comprobantes',
      icon: Receipt,
      description: 'Políticas de descuento, formato de impresión y correlativos.',
      dirty: isSalesDirty,
    },
    {
      id: 'locations',
      label: 'Sucursales y bodegas',
      icon: MapPin,
      description: 'Sedes comerciales y bodegas de almacenamiento.',
      count: ctx.branches.length + ctx.warehouses.length,
    },
    {
      id: 'payments',
      label: 'Cajas y medios de pago',
      icon: Wallet,
      description: 'Cuentas bancarias, cajas físicas y comisiones de tarjeta.',
      count: ctx.accounts.length,
    },
    {
      id: 'members',
      label: 'Usuarios y permisos',
      icon: Users,
      description: 'Equipo de trabajo, roles comerciales y accesos.',
      count: membersResult.count || membersResult.rows.length,
    },
    {
      id: 'audit',
      label: 'Registro de auditoría',
      icon: History,
      description: 'Historial y trazabilidad de operaciones críticas.',
    },
  ];

  return (
    <>
      <ModuleHeading
        title="Configuración"
        description="Administra los datos de tu empresa, preferencias del sistema, sedes, cuentas y accesos de tu equipo."
      >
        <button
          className="button secondary"
          onClick={() => setCatalogs(true)}
          title="Administrar catálogo maestro"
        >
          <Layers size={16} />
          Unidades, categorías y marcas
        </button>
      </ModuleHeading>

      {/* Auxiliary master catalog modal */}
      {catalogs && <CatalogSettings onClose={() => setCatalogs(false)} />}

      {/* Global Feedback Notices */}
      {error && (
        <Notice error>
          <AlertCircle size={18} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </Notice>
      )}

      {success && (
        <Notice>
          <Check size={18} style={{ display: 'inline', marginRight: '6px', color: 'var(--green)' }} />
          {success}
        </Notice>
      )}

      {/* Mobile Horizontal Section Selector */}
      <div className="settings-mobile-nav" role="tablist" aria-label="Secciones de configuración">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              role="tab"
              aria-selected={isActive}
              className={`settings-mobile-pill ${isActive ? 'active' : ''}`}
              onClick={() => switchSection(sec.id)}
            >
              <Icon size={16} />
              <span>{sec.label}</span>
              {sec.dirty && <span className="settings-dirty-dot" title="Cambios pendientes" />}
            </button>
          );
        })}
      </div>

      {/* Main Settings Two-Column Layout */}
      <div className="settings-layout">
        {/* Left Column: Internal Navigation */}
        <aside className="settings-nav" aria-label="Menú de configuración">
          <div className="settings-nav-header">
            <span className="eyebrow">SECCIONES</span>
          </div>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                className={`settings-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => switchSection(sec.id)}
              >
                <Icon size={18} />
                <span className="settings-nav-label">{sec.label}</span>
                {sec.dirty ? (
                  <span className="settings-dirty-pill" title="Cambios sin guardar">
                    Pendiente
                  </span>
                ) : sec.count !== undefined ? (
                  <span className="settings-nav-badge">{sec.count}</span>
                ) : null}
              </button>
            );
          })}

          <div className="settings-nav-footer">
            <div className="settings-nav-meta">
              <span className="muted">Rol activo:</span>
              <strong className="tag">{ctx.business?.role || 'ADMIN'}</strong>
            </div>
            <p className="settings-nav-help muted">
              Los cambios en el negocio se sincronizan con las terminales activas.
            </p>
          </div>
        </aside>

        {/* Right Column: Section Content */}
        <main className="settings-content">
          {/* SECTION 1: DATOS DEL NEGOCIO */}
          {activeSection === 'business' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Datos del negocio</h2>
                  <p className="settings-card-desc">
                    Información comercial, dirección física, datos de contacto y logotipo para
                    comprobantes y cotizaciones.
                  </p>
                </div>
                {isBusinessDirty && (
                  <span className="tag amber">Modificaciones pendientes</span>
                )}
              </header>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSettings(businessForm, 'Datos del negocio');
                }}
              >
                <div className="settings-form-grid-2">
                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Nombre comercial <span className="settings-field-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={businessForm.name}
                      maxLength={200}
                      required
                      placeholder="Ej. Ferretería Central El Tornillo"
                      onChange={(e) =>
                        setBusinessForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                    <span className="settings-field-help">
                      Nombre público que aparecerá en encabezados, reportes y comprobantes de venta.
                    </span>
                  </div>

                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Identificación fiscal (RUC / CIF / NIT)
                    </label>
                    <div className="input-with-icon">
                      <Hash size={16} className="input-prefix-icon" />
                      <input
                        type="text"
                        className="input"
                        value={businessForm.tax_id}
                        placeholder="Ej. J0310000000000"
                        onChange={(e) =>
                          setBusinessForm((prev) => ({ ...prev, tax_id: e.target.value }))
                        }
                      />
                    </div>
                    <span className="settings-field-help">
                      Número de registro tributario legal de tu empresa.
                    </span>
                  </div>
                </div>

                <div className="settings-form-grid-2" style={{ marginTop: '16px' }}>
                  <div className="settings-field-group">
                    <label className="settings-field-label">Teléfono de atención</label>
                    <div className="input-with-icon">
                      <Phone size={16} className="input-prefix-icon" />
                      <input
                        type="tel"
                        className="input"
                        value={businessForm.phone}
                        placeholder="Ej. +505 2222-3333"
                        onChange={(e) =>
                          setBusinessForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                    <span className="settings-field-help">
                      Número telefónico impreso en facturas y estados de cuenta de clientes.
                    </span>
                  </div>

                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Dirección física o sucursal central
                    </label>
                    <textarea
                      rows={3}
                      className="input"
                      value={businessForm.address}
                      placeholder="Ej. De la rotonda central 2 cuadras al norte, Managua."
                      onChange={(e) =>
                        setBusinessForm((prev) => ({ ...prev, address: e.target.value }))
                      }
                    />
                    <span className="settings-field-help">
                      Ubicación comercial que se imprimirá al pie o cabecera de tus documentos.
                    </span>
                  </div>
                </div>

                {/* Logo Upload Block */}
                <div className="settings-logo-block" style={{ marginTop: '24px' }}>
                  <div className="settings-logo-info">
                    <label className="settings-field-label">Logotipo de la empresa</label>
                    <p className="settings-field-help">
                      Se utilizará en la cabecera de comprobantes A4, tickets y vista previa de
                      documentos. Formatos JPG, PNG o WebP (hasta 5 MB).
                    </p>
                  </div>
                  <div className="settings-logo-action">
                    <FileUpload
                      id={ctx.business!.id}
                      action="business.attach"
                      label="Subir nuevo logotipo"
                      onSaved={() => location.reload()}
                    />
                  </div>
                </div>

                <div className="settings-action-bar">
                  {isBusinessDirty && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving}
                      onClick={() => setBusinessForm(initialBusiness)}
                    >
                      Descartar cambios
                    </button>
                  )}
                  <button
                    type="submit"
                    className="button primary"
                    disabled={saving || !isBusinessDirty}
                  >
                    {saving ? 'Guardando…' : 'Guardar datos del negocio'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SECTION 2: PREFERENCIAS GENERALES */}
          {activeSection === 'preferences' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Preferencias generales</h2>
                  <p className="settings-card-desc">
                    Configuración de moneda operativa y zona horaria para cálculos, reportes y cierres
                    de caja.
                  </p>
                </div>
                {isPreferencesDirty && (
                  <span className="tag amber">Modificaciones pendientes</span>
                )}
              </header>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSettings(preferencesForm, 'Preferencias generales');
                }}
              >
                <div className="settings-form-grid-2">
                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Símbolo de moneda principal <span className="settings-field-required">*</span>
                    </label>
                    <div className="input-with-icon">
                      <DollarSign size={16} className="input-prefix-icon" />
                      <input
                        type="text"
                        className="input"
                        value={preferencesForm.currency}
                        maxLength={10}
                        required
                        placeholder="Ej. C$, $, Q, €, S/"
                        onChange={(e) =>
                          setPreferencesForm((prev) => ({ ...prev, currency: e.target.value }))
                        }
                      />
                    </div>
                    <span className="settings-field-help">
                      Símbolo monetario mostrado en precios del catálogo, punto de venta y recibos.
                    </span>
                  </div>

                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Zona horaria oficial <span className="settings-field-required">*</span>
                    </label>
                    <div className="input-with-icon">
                      <Clock size={16} className="input-prefix-icon" />
                      <select
                        className="input"
                        value={preferencesForm.timezone}
                        required
                        onChange={(e) =>
                          setPreferencesForm((prev) => ({ ...prev, timezone: e.target.value }))
                        }
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="settings-field-help">
                      Define el inicio y fin de jornada para reportes de venta y arqueos de caja.
                    </span>
                  </div>
                </div>

                <div className="settings-overview-card" style={{ marginTop: '20px' }}>
                  <span className="eyebrow">RESUMEN REGIONAL ACTIVO</span>
                  <div className="settings-metric-row">
                    <div>
                      <span className="muted">Moneda en uso:</span>
                      <strong>{preferencesForm.currency}</strong>
                    </div>
                    <div>
                      <span className="muted">Zona horaria:</span>
                      <strong>{preferencesForm.timezone}</strong>
                    </div>
                    <div>
                      <span className="muted">Negocio:</span>
                      <strong>{ctx.business?.name}</strong>
                    </div>
                  </div>
                </div>

                <div className="settings-action-bar">
                  {isPreferencesDirty && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving}
                      onClick={() => setPreferencesForm(initialPreferences)}
                    >
                      Descartar cambios
                    </button>
                  )}
                  <button
                    type="submit"
                    className="button primary"
                    disabled={saving || !isPreferencesDirty}
                  >
                    {saving ? 'Guardando…' : 'Guardar preferencias'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SECTION 3: VENTAS Y DOCUMENTOS */}
          {activeSection === 'sales_docs' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Ventas, comprobantes y correlativos</h2>
                  <p className="settings-card-desc">
                    Reglas comerciales de descuento, formato de comprobante impreso y numeración de
                    series.
                  </p>
                </div>
                {isSalesDirty && <span className="tag amber">Modificaciones pendientes</span>}
              </header>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSettings(salesForm, 'Políticas de venta');
                }}
              >
                <div className="settings-form-grid-2">
                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Formato de comprobante impreso <span className="settings-field-required">*</span>
                    </label>
                    <div className="settings-radio-cards">
                      <label
                        className={`settings-radio-card ${salesForm.receipt_format === 'a4' ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="receipt_format"
                          value="a4"
                          checked={salesForm.receipt_format === 'a4'}
                          onChange={() =>
                            setSalesForm((prev) => ({ ...prev, receipt_format: 'a4' }))
                          }
                        />
                        <div className="settings-radio-content">
                          <Printer size={20} />
                          <div>
                            <strong>Hoja A4 / Carta</strong>
                            <p>Facturas completas, cotizaciones formales y despachos de almacén.</p>
                          </div>
                        </div>
                      </label>

                      <label
                        className={`settings-radio-card ${salesForm.receipt_format === '80mm' ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="receipt_format"
                          value="80mm"
                          checked={salesForm.receipt_format === '80mm'}
                          onChange={() =>
                            setSalesForm((prev) => ({ ...prev, receipt_format: '80mm' }))
                          }
                        />
                        <div className="settings-radio-content">
                          <Receipt size={20} />
                          <div>
                            <strong>Ticket térmico 80 mm</strong>
                            <p>Comprobantes rápidos de mostrador para impresoras POS térmicas.</p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="settings-field-group">
                    <label className="settings-field-label">
                      Descuento máximo sin autorización (%) <span className="settings-field-required">*</span>
                    </label>
                    <div className="input-with-icon">
                      <Percent size={16} className="input-prefix-icon" />
                      <input
                        type="number"
                        className="input"
                        min={0}
                        max={100}
                        step="1"
                        required
                        value={salesForm.max_discount}
                        onChange={(e) =>
                          setSalesForm((prev) => ({
                            ...prev,
                            max_discount: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <span className="settings-field-help">
                      Porcentaje máximo de descuento por partida que un cajero o vendedor puede
                      aplicar antes de exigir autorización de administrador.
                    </span>
                  </div>
                </div>

                <div className="settings-action-bar">
                  {isSalesDirty && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving}
                      onClick={() => setSalesForm(initialSales)}
                    >
                      Descartar cambios
                    </button>
                  )}
                  <button
                    type="submit"
                    className="button primary"
                    disabled={saving || !isSalesDirty}
                  >
                    {saving ? 'Guardando…' : 'Guardar políticas de venta'}
                  </button>
                </div>
              </form>

              {/* Sub-block: Series Numbering */}
              <div className="settings-sub-card" style={{ marginTop: '28px' }}>
                <div className="settings-card-header" style={{ marginBottom: '12px' }}>
                  <div>
                    <h3 className="settings-card-title">Correlativos de documentos</h3>
                    <p className="settings-card-desc">
                      Controla los prefijos y el siguiente número que emitirá el sistema en ventas,
                      compras o cotizaciones.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setForm('numbering')}
                  >
                    <Plus size={16} />
                    Configurar correlativo
                  </button>
                </div>
                <p className="muted" style={{ fontSize: '13px' }}>
                  El correlativo configurado debe ser estrictamente mayor que cualquier número de
                  documento ya registrado en la base de datos para preservar la integridad fiscal.
                </p>
              </div>

              {/* Sub-block: Master Catalog quick access */}
              <div className="settings-sub-card" style={{ marginTop: '16px' }}>
                <div className="settings-card-header" style={{ marginBottom: '8px' }}>
                  <div>
                    <h3 className="settings-card-title">Catálogos maestros de inventario</h3>
                    <p className="settings-card-desc">
                      Administra unidades de medida estándar, categorías comerciales y marcas de
                      productos.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setCatalogs(true)}
                  >
                    <Layers size={16} />
                    Abrir catálogos
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: SUCURSALES Y BODEGAS */}
          {activeSection === 'locations' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Sucursales y bodegas</h2>
                  <p className="settings-card-desc">
                    Organiza las sedes comerciales de venta y las bodegas donde se custodia el
                    inventario físico.
                  </p>
                </div>
              </header>

              {/* Sucursales Block */}
              <div className="settings-locations-block">
                <div className="settings-block-header">
                  <div>
                    <h3 className="settings-block-title">
                      Sucursales ({ctx.branches.length})
                    </h3>
                    <p className="settings-block-desc">
                      Puntos de atención donde operan tus cajeros y vendedores.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button primary compact"
                    onClick={() => setForm('branch')}
                  >
                    <Plus size={16} />
                    Nueva sucursal
                  </button>
                </div>

                <div className="settings-items-grid">
                  {ctx.branches.map((b) => {
                    const warehouseCount = ctx.warehouses.filter(
                      (w) => str(w.branch_id) === str(b.id),
                    ).length;
                    return (
                      <div key={str(b.id)} className="settings-item-card">
                        <div className="settings-item-icon">
                          <Building2 size={20} />
                        </div>
                        <div className="settings-item-body">
                          <strong>{str(b.name)}</strong>
                          <span className="muted" style={{ fontSize: '12px' }}>
                            {warehouseCount === 1
                              ? '1 bodega asociada'
                              : `${warehouseCount} bodegas asociadas`}
                          </span>
                        </div>
                        <span className="tag green">Activa</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bodegas Block */}
              <div className="settings-locations-block" style={{ marginTop: '28px' }}>
                <div className="settings-block-header">
                  <div>
                    <h3 className="settings-block-title">
                      Bodegas y almacenes ({ctx.warehouses.length})
                    </h3>
                    <p className="settings-block-desc">
                      Espacios de almacenamiento vinculados a cada sucursal para conteos y traslados.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button primary compact"
                    onClick={() => setForm('warehouse')}
                  >
                    <Plus size={16} />
                    Nueva bodega
                  </button>
                </div>

                <div className="settings-items-grid">
                  {ctx.warehouses.map((w) => {
                    const branch = ctx.branches.find((b) => str(b.id) === str(w.branch_id));
                    return (
                      <div key={str(w.id)} className="settings-item-card">
                        <div className="settings-item-icon">
                          <Warehouse size={20} />
                        </div>
                        <div className="settings-item-body">
                          <strong>{str(w.name)}</strong>
                          <span className="muted" style={{ fontSize: '12px' }}>
                            Sucursal: <strong>{branch ? str(branch.name) : 'Principal'}</strong>
                          </span>
                        </div>
                        <span className="tag blue">Almacén</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: CAJAS Y MEDIOS DE PAGO */}
          {activeSection === 'payments' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Cajas, bancos y medios de pago</h2>
                  <p className="settings-card-desc">
                    Cuentas activas para cobro en punto de venta, compras a proveedores y control de
                    fondos.
                  </p>
                </div>
                <button
                  type="button"
                  className="button primary compact"
                  onClick={() => setForm('account')}
                >
                  <Plus size={16} />
                  Nueva caja o cuenta
                </button>
              </header>

              <div className="table-wrap">
                <Table head={['Nombre de la cuenta', 'Tipo de medio', 'Sucursal', 'Comisión POS', 'Estado']}>
                  {ctx.accounts.map((r) => {
                    const branch = ctx.branches.find((b) => str(b.id) === str(r.branch_id));
                    const kind = str(r.kind);
                    const isCard = kind === 'card';
                    const isCash = kind === 'cash';

                    return (
                      <tr key={str(r.id)}>
                        <td>
                          <strong>{str(r.name)}</strong>
                        </td>
                        <td>
                          <span className={`tag ${isCash ? 'green' : isCard ? 'amber' : 'blue'}`}>
                            {isCash
                              ? 'Efectivo'
                              : isCard
                                ? 'Tarjeta POS'
                                : 'Banco / Transferencia'}
                          </span>
                        </td>
                        <td>{branch ? str(branch.name) : 'Todas'}</td>
                        <td>
                          {isCard ? (
                            <strong>{str(r.commission || 0)} %</strong>
                          ) : (
                            <span className="muted">Sin comisión</span>
                          )}
                        </td>
                        <td>
                          <span className="tag green">Activo</span>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </div>

              <div className="settings-info-box" style={{ marginTop: '16px' }}>
                <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                  Las comisiones de tarjeta se deducen automáticamente en los reportes de margen y
                  cierre de turno para calcular la utilidad neta real del negocio.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 6: USUARIOS Y PERMISOS */}
          {activeSection === 'members' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Usuarios y control de acceso</h2>
                  <p className="settings-card-desc">
                    Asignación de roles de negocio, permisos especiales y control de membresía.
                  </p>
                </div>
                <button
                  type="button"
                  className="button primary compact"
                  onClick={() => {
                    setMember(null);
                    setForm('member');
                  }}
                >
                  <Plus size={16} />
                  Asignar acceso
                </button>
              </header>

              <ListState data={membersResult}>
                <div className="table-wrap">
                  <Table head={['Usuario', 'Rol de negocio', 'Permisos especiales', 'Estado', 'Acción']}>
                    {membersResult.rows.map((r) => {
                      const permissionsList = Array.isArray(r.permissions)
                        ? r.permissions
                        : str(r.permissions)
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);

                      return (
                        <tr key={str(r.user_id)}>
                          <td>
                            <div className="settings-user-cell">
                              <div className="settings-avatar-chip">
                                {str(r.email || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{str(r.email)}</strong>
                                <code className="settings-user-uuid" title={str(r.user_id)}>
                                  {str(r.user_id).slice(0, 8)}…
                                </code>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`tag ${
                                r.role === 'ADMIN'
                                  ? 'blue'
                                  : r.role === 'CAJERO'
                                    ? 'green'
                                    : 'amber'
                              }`}
                            >
                              {str(r.role)}
                            </span>
                          </td>
                          <td>
                            {permissionsList.length > 0 ? (
                              <div className="settings-tags-list">
                                {permissionsList.map((p, i) => (
                                  <span key={i} className="tag compact">
                                    {str(p)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="muted">Estándar del rol</span>
                            )}
                          </td>
                          <td>
                            {r.active ? (
                              <span className="tag green">Activo</span>
                            ) : (
                              <span className="tag red">Desactivado</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button secondary compact"
                              onClick={() => {
                                setMember(r);
                                setForm('member');
                              }}
                            >
                              <Pencil size={14} />
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              </ListState>

              <Notice>
                Los roles y permisos se validan estrictamente en el servidor y en la base de datos
                PostgreSQL. Ningún usuario puede elevar sus propios privilegios de acceso.
              </Notice>
            </div>
          )}

          {/* SECTION 7: REGISTRO DE AUDITORÍA */}
          {activeSection === 'audit' && (
            <div className="settings-section-card">
              <header className="settings-card-header">
                <div>
                  <h2 className="settings-card-title">Registro de auditoría</h2>
                  <p className="settings-card-desc">
                    Trazabilidad cronológica de acciones críticas ejecutadas en el negocio.
                  </p>
                </div>
              </header>

              <ListState data={auditResult}>
                <div className="table-wrap">
                  <Table head={['Fecha y hora', 'Acción realizada', 'Usuario', 'Origen']}>
                    {auditResult.rows.map((r) => (
                      <tr key={str(r.id)}>
                        <td>{str(r.created_at).slice(0, 19).replace('T', ' ')}</td>
                        <td>
                          <code>{str(r.action)}</code>
                        </td>
                        <td>
                          <span className="tag">{str(r.user_id).slice(0, 8)}</span>
                        </td>
                        <td>
                          <span className="muted">{str(r.origin_id).slice(0, 8) || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
                <Pagination
                  page={auditPage}
                  count={auditResult.count}
                  onChange={setAuditPage}
                />
              </ListState>
            </div>
          )}
        </main>
      </div>

      {/* Unsaved Changes Discard Modal */}
      {showDiscardModal && (
        <Modal
          title="¿Descartar cambios sin guardar?"
          onClose={() => setShowDiscardModal(false)}
        >
          <div style={{ padding: '8px 0 16px' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.5' }}>
              Tienes modificaciones pendientes en la sección actual. Si continúas a otra sección sin
              guardar, los cambios se perderán.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '20px',
              }}
            >
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowDiscardModal(false)}
              >
                Permanecer aquí
              </button>
              <button
                type="button"
                className="button primary"
                onClick={discardAndSwitch}
              >
                Descartar y continuar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Entity Creation / Editing Modal */}
      {form && (
        <FormModal
          title={
            form === 'member'
              ? member
                ? 'Editar acceso de usuario'
                : 'Asignar acceso a usuario'
              : form === 'numbering'
                ? 'Configurar correlativo de documentos'
                : `Agregar ${
                    form === 'branch'
                      ? 'sucursal'
                      : form === 'warehouse'
                        ? 'bodega'
                        : 'caja o cuenta'
                  }`
          }
          action={
            form === 'member'
              ? 'membership.save'
              : form === 'numbering'
                ? 'numbering.save'
                : 'structure.save'
          }
          fields={fields[form]}
          initial={
            form === 'member'
              ? {
                  ...member,
                  permissions_text: Array.isArray(member?.permissions)
                    ? member.permissions.join(', ')
                    : str(member?.permissions || ''),
                }
              : { kind: form }
          }
          transform={(v) =>
            form === 'member'
              ? {
                  ...v,
                  permissions: str(v.permissions_text)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : v
          }
          onClose={() => {
            setForm('');
            setMember(null);
          }}
          onSaved={() => location.reload()}
        />
      )}
    </>
  );
}
