# ローカルSupabase開発環境 立ち上げ仕様書

## 目的

Next.js + Supabase のアプリをローカルで開発・検証するための、Docker上のSupabase環境の立ち上げ手順と運用ルールをまとめる。

この手順は、NazoAppだけでなく、今後作成する別アプリでも再利用できることを目的とする。

## 前提

- Docker Desktop が起動している
- Node.js が利用できる
- プロジェクトに `supabase` CLI が devDependency として入っている、または `npx supabase` が利用できる
- 各アプリごとに `supabase/config.toml` が存在する
- `.env.local` はローカルSupabase用、`.env.remote.local` はリモートSupabase用として分ける

## 基本方針

ローカルSupabaseは Docker コンテナ群として起動する。

同じPC上で複数アプリのローカルSupabaseを使う場合、競合しやすいのは主に以下。

- Supabase API / DB / Studio などのホスト側ポート
- `supabase/config.toml` の `project_id`
- Next.js dev server のポート
- `.env.local` の接続先URLとキー

1つのアプリだけ起動する場合は、ほぼ問題にならない。複数アプリを同時に起動する場合は、各アプリで `project_id` とポートを分ける。

## NazoAppのローカルポート

現在の `supabase/config.toml` では以下を使う。

| 用途 | ポート | URL |
|---|---:|---|
| Supabase API | 54321 | `http://127.0.0.1:54321` |
| Postgres DB | 54322 | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | 54323 | `http://127.0.0.1:54323` |
| Inbucket | 54324 | `http://127.0.0.1:54324` |
| Analytics | 54327 | internal/local |
| Shadow DB | 54320 | local migration/diff用 |
| Next.js | 3000 | `http://localhost:3000` |

## 競合は起きるか

起きる可能性はある。

### 起きないケース

- NazoAppだけを起動している
- 別アプリを使う前に `npx supabase stop` でNazoApp側を停止している
- 別アプリでも同じデフォルトポートを使うが、同時起動しない

### 起きるケース

- 複数アプリで同じSupabaseポートを使って同時起動する
- 複数アプリで同じ `project_id` を使う
- 複数アプリで Next.js を同じ `3000` ポートで同時起動する
- `.env.local` が別アプリのSupabase URL / keyを指している

## 複数アプリを同時起動する場合の設計

別アプリを同時に起動したい場合、`supabase/config.toml` をアプリごとに変える。

例: 2つ目のアプリ

```toml
project_id = "my-next-app"

[api]
port = 55321

[db]
port = 55322
shadow_port = 55320

[studio]
port = 55323
api_url = "http://127.0.0.1"

[inbucket]
port = 55324

[analytics]
port = 55327

[auth]
site_url = "http://127.0.0.1:3001"
additional_redirect_urls = ["http://127.0.0.1:3001"]
```

Next.jsも別ポートで起動する。

```powershell
npm run dev -- --port 3001
```

`.env.local` も合わせる。

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

`anon key` と `service_role key` は `npx supabase status` の出力を使う。

## 初回セットアップ

```powershell
cd C:\path\to\your-app
npm install
npx supabase --version
npx supabase start
```

初回はDocker imageの取得があるため時間がかかる。

## 通常の起動手順

ターミナル1:

```powershell
cd C:\path\to\your-app
npx supabase start
npx supabase status
```

ターミナル2:

```powershell
cd C:\path\to\your-app
npm run dev
```

ブラウザ:

```txt
http://localhost:3000
```

Supabase Studio:

```txt
http://127.0.0.1:54323
```

## Supabase Studioを開く

Supabase Studioは、ローカルSupabaseのDB、Auth、Storageをブラウザで確認・操作する管理画面。

まずローカルSupabaseを起動する。

```powershell
cd C:\path\to\your-app
npx supabase start
```

起動後、Studio URLを確認する。

```powershell
npx supabase status
```

出力の `Studio URL`、または `Development Tools` の `Studio` に表示されるURLをブラウザで開く。

NazoAppの標準設定では以下。

```txt
http://127.0.0.1:54323
```

PowerShellから既定ブラウザで開く場合:

```powershell
Start-Process http://127.0.0.1:54323
```

Studioでよく使う場所:

- `Table Editor`: DBテーブルの中身を確認する
- `SQL Editor`: SQLを手動実行する
- `Authentication > Users`: ローカルのログインユーザーを作る
- `Storage`: bucketとアップロード済みファイルを確認する

Studioが開けない場合は、まず以下を確認する。

```powershell
npx supabase status
```

`Studio` が停止している、またはポートが違う場合は、表示されたURLを使う。ポート競合がある場合は、`supabase/config.toml` の `[studio].port` を変更してから起動し直す。

## DBを作り直す

ローカルDBをmigrationから作り直す。

```powershell
npx supabase db reset
```

注意: ローカルDBのデータは消える。

`supabase/config.toml` で seed が有効な場合、`supabase/seed.sql` が必要になる。seedを使わない場合でも空ファイルを置いておくと扱いやすい。

```powershell
New-Item -ItemType File -Path supabase\seed.sql -Force
npx supabase db reset
```

## 停止手順

データを残して停止する。

```powershell
npx supabase stop
```

データも含めて破棄する。

```powershell
npx supabase stop --no-backup
```

## 認証ユーザーの作成

管理画面ログインが必要なアプリでは、ローカルSupabaseにテストユーザーを作る。

1. Supabase Studioを開く
2. `Authentication > Users` を開く
3. テスト用メールアドレスとパスワードでユーザーを作る
4. アプリの管理ログイン画面からログインする

## Storageの確認

画像アップロードなどを使う場合、migrationまたは `schema.sql` でbucketを作成する。

NazoAppでは `question-images` bucketを使用する。

```env
QUESTION_IMAGE_BUCKET=question-images
```

## よくあるトラブル

### `supabase` が認識されない

グローバルコマンドではなく `npx supabase` を使う。

```powershell
npx supabase start
```

### ポートが使用中

別アプリのSupabaseまたはNext.jsが起動している可能性がある。

対処:

- 使っていないアプリで `npx supabase stop`
- Next.js dev serverを停止
- 同時起動が必要なら `supabase/config.toml` のポートをずらす

### `.env.local` が違う環境を向いている

ローカル開発時は以下を確認する。

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<api-port>
NEXT_PUBLIC_APP_URL=http://localhost:<next-port>
```

リモート環境用のキーは `.env.remote.local` に分け、通常の `npm run dev` では読ませない。

### migrationとschema.sqlの差分が増える

運用方針を決める。

- 新規環境の全体像: `supabase/schema.sql`
- 差分適用: `supabase/migrations/*.sql`
- ローカル再構築: `npx supabase db reset`

アプリ開発では、基本的にmigrationを追加し、`schema.sql` も最新状態に追従させる。

## チェックリスト

- [ ] Docker Desktop が起動している
- [ ] `npx supabase start` が成功する
- [ ] `npx supabase status` のURL/keyを `.env.local` に反映している
- [ ] `npx supabase db reset` が成功する
- [ ] `npm run dev` が成功する
- [ ] Supabase Studioを開ける
- [ ] Authユーザーを作成できる
- [ ] Storage bucketが作成されている
- [ ] 管理画面からログインできる
- [ ] 参加者画面から基本フローを確認できる
