import { useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { supabase } from '../../utils/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError('登录失败：请检查邮箱和密码。');
  };

  return <main className="auth-page">
    <form className="auth-card" onSubmit={submit}>
      <span className="auth-mark"><LockKeyhole size={24}/></span>
      <p>OOOLJ.FUN</p><h1>回到我们的回忆里</h1>
      <span>仅限受邀请的两位成员访问</span>
      <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button type="submit" disabled={submitting}><LogIn size={17}/>{submitting ? '正在登录…' : '登录回忆站'}</button>
      <small>账号由空间所有者创建。如需帮助，请联系对方。</small>
    </form>
  </main>;
}
