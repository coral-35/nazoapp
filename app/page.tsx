import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">謎解き企画アプリ</div>
        <nav className="nav-links" aria-label="メイン">
          <Link href="/join">参加する</Link>
          <Link href="/admin/login">出題者ログイン</Link>
        </nav>
      </header>

      <section className="page hero-band">
        <div>
          <h1 className="hero-title">謎解き企画アプリ</h1>
          <p className="lead">
            ルーム番号で参加し、出題者が開始した問題に解答するためのMVPです。
          </p>
          <div className="action-row">
            <Link className="button" href="/join">
              参加者として入る
            </Link>
            <Link className="button secondary" href="/admin/login">
              出題者画面へ
            </Link>
          </div>
        </div>
        <div className="panel stack">
          <span className="status waiting">MVP</span>
          <h2>イベント当日の基本動線</h2>
          <p className="muted">
            出題者がルームと問題を準備し、参加者はスマートフォンから問題画像を見て解答します。
          </p>
        </div>
      </section>
    </main>
  );
}
