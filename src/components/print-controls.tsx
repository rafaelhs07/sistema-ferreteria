'use client';
export function PrintControls() {
  return (
    <div className="print-controls">
      <button className="button primary" onClick={() => window.print()}>
        Imprimir / guardar PDF
      </button>
      <button className="button secondary" onClick={() => window.close()}>
        Cerrar
      </button>
    </div>
  );
}
