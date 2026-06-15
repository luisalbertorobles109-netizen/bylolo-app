import { useEffect, useState } from 'react';

export function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}
export function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 2400); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg];
}
export function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}
