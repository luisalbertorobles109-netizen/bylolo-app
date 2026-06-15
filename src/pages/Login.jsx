import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/UI';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, pass);
        if (error) throw error;
        nav('/');
      } else {
        const { error } = await signUp(email, pass, name);
        if (error) throw error;
        setToast('✓ Cuenta creada. Si pide confirmar correo, revisa tu bandeja.');
        setMode('login');
      }
    } catch (err) {
      setToast('⚠ ' + (err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : err.message));
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo-bylolo.png" alt="ByLolo" style={{ width: 88, height: 88, borderRadius: 20, display: 'block', margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, textAlign: 'center' }}>ByLolo <em style={{ fontStyle: 'normal', background: 'linear-gradient(90deg,var(--pigment),var(--violet))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Studio</em></h2>
        <p className="lead" style={{ color: 'var(--muted)', margin: '6px 0 20px' }}>
          {mode === 'login' ? 'Inicia sesión para entrar a tu estación.' : 'Crea tu cuenta. El primer usuario registrado será el Administrador.'}
        </p>
        {mode === 'signup' && (
          <div className="field"><label>Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
        )}
        <div className="field"><label>Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field"><label>Contraseña</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? '...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button type="button" className="btn ghost sm" style={{ width: '100%', marginTop: 10 }}
          onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? '¿Equipo nuevo? Crear cuenta' : 'Ya tengo cuenta'}
        </button>
        <Toast msg={toast} />
      </form>
    </div>
  );
}
