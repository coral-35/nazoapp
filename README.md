# 謎解き企画アプリ

ルーム参加型の謎解き企画用Webアプリです。参加者は6桁数字のルーム番号で参加し、準備後に問題を開始して、制限時間・解答可能回数の範囲でローカル判定を行います。参加者向けレスポンスには正答文字列ではなくSHA-256ハッシュだけを返し、最終結果はサーバー側でも再判定します。

## 技術スタック

- Next.js App Router
- TypeScript / React
- Supabase Postgres / Auth / Storage
- Vercel想定

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000` を開きます。

## 必要な環境変数

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
QUESTION_IMAGE_BUCKET=question-images
LOCAL_ADMIN_EMAIL=admin@example.test
LOCAL_ADMIN_PASSWORD=
```

`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用です。`NEXT_PUBLIC_` を付けないでください。
`LOCAL_ADMIN_EMAIL` と `LOCAL_ADMIN_PASSWORD` はローカルSupabase専用の出題者アカウントです。パスワードは6文字以上で設定し、`.env.local` をGitへcommitしないでください。

## Supabase準備

1. Supabaseでプロジェクトを作成します。
2. リモート環境ではAuthenticationで出題者用ユーザーを作成します。ローカル環境では後述のseedコマンドを使用します。
3. SQL Editorで [supabase/schema.sql](supabase/schema.sql) を実行します。
   既存環境を更新する場合は [20260621000000_local_start_multi_attempt_hash.sql](supabase/migrations/20260621000000_local_start_multi_attempt_hash.sql)、続けて [20260622000000_answered_before_reveal.sql](supabase/migrations/20260622000000_answered_before_reveal.sql) を適用します。
4. `question-images` Storageバケットが作成されます。APIがservice roleでアップロードし、参加者へは現在問題の署名付きURLのみ返します。
5. `.env.local` にURL、anon key、service role keyを設定します。

### ローカルSupabase

[supabase/config.toml](supabase/config.toml) の `project_id` は `quiz` に統一しています。ローカルSupabaseと出題者アカウントは次のコマンドで起動・作成します。

```bash
cd /Users/user/nazo/quiz
npm run supabase:start
npm run dev
```

`npm run supabase:start` は `npx supabase start` の後に、`.env.local` の `LOCAL_ADMIN_EMAIL` と `LOCAL_ADMIN_PASSWORD` を使って出題者を作成します。すでに同じメールアドレスのユーザーがいる場合は変更しないため、日常起動で繰り返し実行できます。

DBをmigrationとseedから再構築する必要がある場合だけ、次を実行します。このコマンドはローカルDB内のデータを削除します。

```bash
npm run supabase:reset
```

出題者作成スクリプトは `localhost`、`127.0.0.1`、`::1` 以外のSupabase URLを拒否します。リモート環境へローカル用アカウントを誤作成しません。

## 開発資料

- [ローカルSupabase開発環境 立ち上げ仕様書](nazotoki_codex_docs/local-supabase-development-guide.md)
- [シンプルなNext.js + Supabaseアプリ 要件定義入力資料](nazotoki_codex_docs/simple-next-supabase-requirements-input.md)

## 主要画面

- `/` トップ
- `/join` 参加者のルーム参加
- `/play/[roomCode]` 参加者の問題解答
- `/admin/login` 出題者ログイン
- `/admin/rooms` ルーム一覧・作成
- `/admin/rooms/[roomId]` 問題登録、開始、締切、セット別・総合成績確認

## 主要API

- `POST /api/join-room`
- `GET /api/current-question`
- `POST /api/submit-answer`
- `GET /api/my-score`
- `POST /api/admin/create-room`
- `GET /api/admin/rooms`
- `GET /api/admin/rooms/[roomId]`
- `POST /api/admin/upload-question-image`
- `POST /api/admin/create-question`
- `POST /api/admin/start-question`
- `POST /api/admin/close-question`
- `GET /api/admin/scores`

## 動作確認手順

1. 出題者で `/admin/login` からログインします。
2. `/admin/rooms` でルームを作成し、発行された6桁数字のルーム番号を確認します。
3. ルーム詳細で問題画像、通常／4択モード、正答、制限時間、解答可能回数を登録します。
4. `/join` でルーム番号と参加者名を入力して参加します。
   同じブラウザから同一ルームへ参加できるのは1アカウントだけです。別ルームには参加できます。
5. 出題者画面で問題を開始します。
6. 参加者画面で問題タイトル・回答欄・画像プレースホルダーが表示されることを確認します。
7. 画像表示前から回答でき、「画像を表示して開始」後だけタイマーが進むことを確認します。
8. 正解・タイムアップ・回数上限到達の最終結果だけが保存されることを確認します。
9. 複数参加者の正答が回答時間順に表示されることを確認します。
10. 出題者画面で締切し、参加者が解答できないことを確認します。

## セキュリティ上の注意

- 参加者向けAPIは正答文字列を返さず、正規化済み正答のSHA-256ハッシュだけを返します。
- ローカル判定後も、`submit-answer` が最終解答をDB上の正答で再判定します。
- `submissions` の最終結果の一意制約で二重回答を防ぎます。成績は正解した問題数と、その回答時間の合計から集計します。
- 管理APIはSupabase AuthのBearerトークンを検証します。
- 参加端末はHTTP-only Cookieで識別し、`room_id + device_token_hash` 一意制約で同じブラウザから同一ルームへの二重参加を防ぎます。
- Cookieやブラウザデータを完全に削除した場合は別端末として扱われるため、物理端末を厳密に識別する仕組みではありません。
- RLSを有効化し、ブラウザからテーブルを直接読ませない前提です。

## 問題モードとセット集計

- 問題登録時に通常（文字入力）／4択（A〜D）を選択します。4択の選択肢本文は問題画像に記載し、正答をA〜Dから選びます。参加者はボタンで選択して「解答する」を押します。
- ルーム作成時またはルーム詳細で1セットの問題数を設定できます（初期値7問、1〜1000問）。出題順1〜7問がセット1、8〜14問がセット2となり、最後の端数も集計します。設定変更時は過去の結果も新しい区切りで再集計します。
- 管理画面・参加者画面にセット別と総合の正解数・正解タイム合計を表示します。不正解・時間切れ・未回答は合計タイムに含みません。画像表示前の正解は従来どおり0秒です。管理画面は「成績を更新」で最新結果を取得します。
- 旧データのタイム未記録は正解数に含め、未記録件数を明記します。得点の表示・加算は終了し、旧得点カラムは履歴互換のため残します。
- 既存DBには `supabase/migrations/20260915000000_question_modes_set_results.sql` の適用が必要です。ローカル環境では `npx supabase migration up --local` を実行します。既存問題は通常モード、既存ルームは7問セットになります。

ローカルAPI統合テスト（起動済みSupabase・ローカル管理者・Dockerが必要）:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3101
# 別ターミナルで実行。一時ルームを作成し、終了時に削除します。
node --env-file=.env.local scripts/test-results-local.mjs
```
