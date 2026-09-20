"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { verifyAdminLogin } from "@/lib/admin-login";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        throw new Error("メールアドレスまたはパスワードを確認してください。");
      }

      if (!data.session) throw new Error("ログイン情報を取得できませんでした。");
      await verifyAdminLogin(data.session.access_token);
      // Start a fresh navigation after the new session is persisted.
      window.location.assign("/admin");
    } catch (caught) {
      await getSupabaseBrowserClient().auth.signOut();
      setError(caught instanceof Error ? caught.message : "ログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          謎解き早解き感謝祭
        </Link>
      </header>

      <section className="narrow-page">
        <div className="panel stack">
          <div>
            <span className="status waiting">出題者</span>
            <h1>ログイン</h1>
            <p className="muted">出題者アカウントでログインしてください。</p>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span>メールアドレス</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>パスワード</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <div className="message error">{error}</div> : null}
            <button className="button" type="submit" disabled={loading}>
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
