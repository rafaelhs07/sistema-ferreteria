'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal, Notice } from './ui';
type Detector = {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};
type DetectorClass = { new (options: { formats: string[] }): Detector };
export function BarcodeCamera({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function init() {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
        if (!Detector) {
          setError(
            'Este navegador no permite lectura con cámara. Escribe el código o usa un lector de teclado.',
          );
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code'],
        });
        async function scan() {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]) {
              stopped = true;
              onCode(found[0].rawValue);
              return;
            }
          } catch {}
          timer = setTimeout(scan, 350);
        }
        void scan();
      } catch {
        setError('No se pudo abrir la cámara. Permite su acceso o escribe el código.');
      }
    }
    void init();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <Modal title="Leer código de barras" onClose={onClose}>
      <div className="scanner">
        <video ref={video} playsInline muted aria-label="Vista de la cámara" />
        {error && <Notice error>{error}</Notice>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual) onCode(manual);
          }}
        >
          <label>
            Código manual
            <input value={manual} onChange={(e) => setManual(e.target.value)} autoFocus />
          </label>
          <button className="button primary">Buscar código</button>
        </form>
      </div>
    </Modal>
  );
}
