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

## 結果発表画面・50人のサンプルデータ

管理画面のルーム詳細にある「結果発表画面を開く」から `/admin/rooms/[roomId]/results` を開けます（ルーム所有者のログインが必要）。

- 「総合結果」と各セットのタブで表示を切り替えます。
- 正解数の降順、正解した問題の合計タイムの昇順に並びます。両方が同じ場合は同順位（例：1位・1位・3位）。
- タイムは小数点以下3桁の秒で表示し、ミリ秒単位で比較します。未記録のタイムは0秒扱いにせず、同正解数の記録済み成績の後に表示します。
- 「結果を更新」で最新の解答記録を取り込みます。タブは左右矢印・Home・Endキーでも切り替えられます。

ローカルSupabase起動・DB移行適用後、次のコマンドでサンプルを作成します。

```bash
npm run seed:results:local
```

「結果発表サンプル（50人・7問×3セット）」という専用ルームに、架空の参加者50人、問題21問、解答記録1,050件を保存します。全問正解、同順位、不正解、時間切れ、正解なしを含みます。既存のローカル管理者が所有し、ルーム番号と画面パスはコマンドの出力で確認できます。

再実行は同じサンプル用IDを使用し、サンプルの問題・解答・セット設定を初期状態に戻します。人数や解答件数は増えません。他のルームは変更しません。サンプル参加者の認証トークンも再生成されます。リモートDBへの書き込みは拒否します。

起動済みアプリに対するサンプル集計の照合（既定の検証先は `http://127.0.0.1:3101`）:

```bash
# 3000番でアプリを起動している場合
QUIZ_TEST_ORIGIN=http://127.0.0.1:3000 node --env-file=.env.local scripts/test-sample-results-local.mjs
```

## 実験ブランチ：番号なしの既定ルーム参加

`experiment/default-room-entry` では、トップページ `/` を開くと `/join` に移動し、名前だけで既定ルームへ参加できます。参加後のURLは `/play` です。画面上のルーム番号入力・表示は省き、内部DBの識別情報と旧API・旧 `/play/[roomCode]` は互換性のため保持します。

- 同じブラウザーに既定ルームの参加情報が保存されていれば、有効性をサーバーで確認して `/play` へ直接移動します。
- 無効な参加トークンは破棄して名前入力に戻ります。通信エラーではキャッシュを残し、再試行できます。
- 別ルームのキャッシュは使用しません。既定ルームが未準備ならエラーを表示します。
- 未設定時の既定ルームは50人のサンプルルームです。切り替える場合は `.env.local` の `DEFAULT_ROOM_ID` に対象ルームのUUIDを設定し、アプリを再起動してください。管理画面で新しいルームを作っても既定ルームは自動変更されません。
- 参加者を受け入れるにはルームを受付可能な状態にする必要があります。サンプルは次のコマンドで受付開始できます（解答記録は保持）。

```bash
# サンプル未作成時のみ先に実行
npm run seed:results:local
# 完了状態のサンプルを参加受付中へ変更
npm run prepare:entry:local
npm run dev
```

参加者は `http://localhost:3000` から入ります。既存のサンプル参加者50人に加えて、新しい名前で参加するたびに参加者が追加されます。サンプル問題を出す場合は出題者ログインから既定ルームの問題を開始してください。

参加導線のローカルAPI検証（一時参加者は終了時に削除）:

```bash
QUIZ_TEST_ORIGIN=http://127.0.0.1:3000 node --env-file=.env.local scripts/test-default-entry-local.mjs
```

## 単一イベント版

現在の `experiment/single-event` は1つのイベントを運用する版です。参加者は `/` から名前を入力して参加し、保存済みの参加情報が有効なら `/play` に復帰します。参加者サイトに出題者リンクはありません。出題者はURLへ直接 `/admin` を入力し、ログイン後に問題登録・進行・成績を管理します。結果発表は `/admin/results` です。

イベント作成・一覧は廃止しました。管理APIは常に設定された単一イベントを操作します。DBの `rooms` テーブルは `event_settings`、関連する `room_id` 列は `event_id` に変更しています。参加者の既存キャッシュと解答記録を引き継ぐため、内部の旧識別コードは保持しています。既存DBには `20260915010000_single_event.sql` の適用が必要です。

保存ブランチ:

- `basic/rooms`: ルーム番号・ルーム作成・一覧があるベーシック版
- `basic/default-room-entry`: 番号なし参加導線を加えた、ルームDBを持つ版

これらは旧DB構造を使用します。現在のローカルDBは単一イベント構造に移行済みのため、ベーシック版を実行するときは別のSupabase環境を使って、そのブランチのマイグレーションでDBを構築してください。コードのブランチ切り替えだけではDB構造は戻りません。

この版の検証は `npm test` と、起動済みアプリへの `scripts/test-default-entry-local.mjs`、`scripts/test-sample-results-local.mjs` で行います。旧ルーム作成APIを使う検証スクリプトは削除しました。上記READMEの旧 `/admin/rooms`・ルーム作成に関する説明は保存したベーシック版についての説明です。
