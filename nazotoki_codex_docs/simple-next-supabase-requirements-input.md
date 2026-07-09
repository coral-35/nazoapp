# シンプルなNext.js + Supabaseアプリ 要件定義入力資料

## 目的

今後、新しいアプリを作るときに、NazoAppと同じようなシンプルな技術スタック・構成・運用方針を再現するための入力資料。

この資料は、そのまま要件定義書を書くための前提・制約・推奨構成として使う。

## 基本方針

小〜中規模の個人開発・イベント用・業務補助アプリでは、次の方針を優先する。

- 技術を増やしすぎない
- Next.js App Routerを中心にする
- DB/Auth/StorageはSupabaseに寄せる
- サーバー処理はNext.js Route Handlerで実装する
- 複雑なバックエンドサーバーを別途立てない
- MVPではリアルタイムやジョブキューを過剰に使わない
- DB変更はmigrationで管理する
- ローカルSupabaseで再現できる開発環境にする
- セキュリティ上重要な判定はサーバー側で再検証する

## 推奨技術スタック

| 領域 | 採用候補 | 方針 |
|---|---|---|
| フロントエンド | Next.js App Router | 画面とAPIを同一プロジェクトで管理 |
| UI | React + CSS ModulesまたはグローバルCSS | まずはCSSを増やしすぎない |
| 言語 | TypeScript | 型安全を基本にする |
| DB | Supabase Postgres | SQLで状態を明確に保つ |
| Auth | Supabase Auth | 管理者ログインやユーザー認証に使う |
| Storage | Supabase Storage | 画像・添付ファイル保存に使う |
| API | Next.js Route Handlers | `app/api/**/route.ts` に集約 |
| ローカル環境 | Supabase CLI + Docker | 本番に近いDB/Auth/Storageをローカルで再現 |
| デプロイ | Vercel + Supabase hosted | 小さく始めやすい |

## 避けたい構成

MVP段階では、以下は必要になるまで避ける。

- 独自Express/NestJSサーバー
- PrismaなどのORM導入
- Reduxなどの大きい状態管理
- 複雑なUIコンポーネントフレームワーク
- マイクロサービス化
- キュー、ワーカー、cronの早期導入
- 独自認証
- Docker Composeでアプリ本体まで過度に固める

必要になった場合だけ、理由を明記して追加する。

## 標準ディレクトリ構成

```txt
app/
  page.tsx
  layout.tsx
  globals.css
  api/
    <feature>/
      route.ts
  <screen>/
    page.tsx
lib/
  supabase/
    client.ts
    server.ts
  auth.ts
  http.ts
supabase/
  config.toml
  migrations/
  seed.sql
  schema.sql
docs/
  requirements.md
  setup-local-supabase.md
```

小さいアプリでは、components分割を急がない。重複や見通しが悪くなった時点で切り出す。

## 環境変数の標準

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

ファイル運用:

- `.env.local`: ローカルSupabase用
- `.env.remote.local`: リモートSupabase用の退避ファイル
- `.env.example`: 空値または説明用

`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用。クライアントコンポーネントや `NEXT_PUBLIC_` 付き変数へ出さない。

## Supabaseローカル環境方針

各アプリに `supabase/config.toml` を置く。

単独起動ならデフォルトポートでよい。

複数アプリを同時起動する可能性がある場合は、アプリごとに以下を分ける。

- `project_id`
- API port
- DB port
- Studio port
- Inbucket port
- Analytics port
- Next.js port
- `.env.local` のURL/key

## DB設計方針

基本ルール:

- 主キーは `uuid default gen_random_uuid()`
- `created_at` は `timestamptz default now()`
- 更新されるテーブルには `updated_at`
- 外部キーを明示する
- 重要な重複防止はDBのunique制約で担保する
- アプリ上の権限チェックだけに頼らない
- 最初からRLS有効化を前提にする
- サーバーAPIはservice roleで必要最小限の操作をする

例:

```sql
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## API設計方針

Route Handlerを使う。

```txt
app/api/<resource>/route.ts
app/api/<resource>/<id>/route.ts
```

API実装のルール:

- 入力値を必ず検証する
- 認証が必要なAPIではBearer tokenを検証する
- クライアントからの権限・得点・判定結果などを信用しすぎない
- DB保存前にサーバー側で再判定する
- エラーはJSONで返す
- メッセージは利用者向けに短くする

## 認証・認可方針

管理画面や個人データ編集にはSupabase Authを使う。

実装方針:

- ブラウザ側はSupabase anon keyでログイン
- 管理APIはAuthorization Bearer tokenを受け取る
- サーバー側で `auth.getUser(token)` を実行する
- さらにDB上の所有者・所属関係を確認する

## UI方針

MVPでは派手さより使いやすさを優先する。

- 最初の画面で主要操作ができる
- ローディング、エラー、空状態を用意する
- ボタン連打を防ぐ
- スマホ幅で操作できる
- テーブルは横スクロールを許可する
- 入力フォームはラベルを明確にする
- 危険操作には確認を入れる

## ローカル開発標準手順

```powershell
npm install
npx supabase start
npx supabase db reset
npm run dev
```

停止:

```powershell
npx supabase stop
```

破棄:

```powershell
npx supabase stop --no-backup
```

## 要件定義書に必ず書く項目

新しいアプリの要件定義では、最低限以下を書く。

```txt
1. アプリの目的
2. 想定ユーザー
3. MVPスコープ
4. 対象外
5. 画面一覧
6. 主要ユーザーフロー
7. データモデル
8. API一覧
9. 認証・権限
10. ファイル保存の有無
11. ローカル開発環境
12. 環境変数
13. 受け入れ条件
14. 手動テスト項目
15. 将来拡張
```

## 要件定義用テンプレート

```md
# <アプリ名> 要件定義書

## 目的

<誰のどんな作業・体験を楽にするか>

## MVPスコープ

- <必須機能1>
- <必須機能2>
- <必須機能3>

## 対象外

- <今はやらないこと>

## 技術スタック

- Next.js App Router
- TypeScript
- Supabase Postgres/Auth/Storage
- Supabase CLI + Docker for local development
- Vercel deploy

## 画面

| パス | 用途 |
|---|---|
| `/` | トップ |
| `/login` | ログイン |
| `/admin` | 管理 |

## データモデル

| テーブル | 用途 |
|---|---|
| `...` | ... |

## API

| Method | Path | 用途 | 認証 |
|---|---|---|---|
| GET | `/api/...` | ... | 要/不要 |

## 権限

- 管理者のみできること
- 一般ユーザーができること
- 未ログインでできること

## ローカル開発

- `npx supabase start`
- `npx supabase db reset`
- `npm run dev`

## 受け入れ条件

- [ ] <条件1>
- [ ] <条件2>
```

## 実装時の優先順位

1. データ整合性
2. 認証・権限
3. MVPの主要フロー
4. エラー表示
5. スマホ操作性
6. 管理画面の最低限の見やすさ
7. 見た目の磨き込み

## 判断基準

迷ったら以下を優先する。

- 既存のNext.js + Supabase構成で完結できるか
- DB制約で守れるものはDBで守っているか
- クライアント値を信用しすぎていないか
- ローカルSupabaseで再現できるか
- 将来の自分が読み返して理解できるか
- 今のMVPに不要な抽象化を入れていないか
