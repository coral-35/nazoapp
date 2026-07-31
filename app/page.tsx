import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">謎解き企画アプリ</div>
        <nav className="nav-links" aria-label="メイン">
          <Link href="/admin/login">出題者ログイン</Link>
        </nav>
      </header>

      <section className="page hero-band">
        <div>
          <h1 className="hero-title">謎解きに参加</h1>
          <p className="lead">案内された6桁のルーム番号と名前を入力してください。</p>
          <div className="action-row">
            <Link className="button" href="/join">
              ルームに参加する
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
