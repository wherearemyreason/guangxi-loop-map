export function SetupPage() {
  return <main className="auth-page"><section className="auth-card setup-card">
    <p>OOOLJ.FUN</p><h1>等待私密服务配置</h1>
    <span>请在 Vercel 环境变量中配置 Supabase 后再开放本站。</span>
    <code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code>
    <small>请勿在前端配置 R2 密钥或 Supabase service role key。</small>
  </section></main>;
}
