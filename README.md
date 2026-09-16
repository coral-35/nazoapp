# 謎解き企画アプリ

単一イベントの参加者向け解答画面、出題者管理画面、結果発表画面を提供する Next.js / Supabase アプリです。

参加者は `/` から名前でエントリーし、同じブラウザーに有効な参加情報があれば `/play` に直接復帰します。出題者はURLへ `/admin` を直接入力してログインします。管理画面から通常問題・A〜Dの4択問題を登録・開始・締切できます。

結果は正解数の多い順、同数なら正解した問題の合計タイムが短い順に並びます。管理者は `/admin/results` を画面共有するか、管理画面のボタンで参加者の `/play` を結果発表へ切り替えられます。管理画面は結果発表の下部から、参加者画面は上部から表示します。通常時は参加者画面に結果を表示しません。

## 本番環境の設定

Supabaseに [migrations](supabase/migrations) を適用し、Authenticationで出題者のユーザーを作成します。次に、SQL Editorで単一イベントを作成します。下記のメールアドレス、内部コード（既存行と重複しない6桁）、イベント名は実際の値に置き換えてください。`room_code` は既存DBとの互換に必要な内部コードで、参加者は入力しません。

```sql
insert into public.event_settings (id, room_code, title, status, created_by, questions_per_set)
select gen_random_uuid(), '123456', '謎解き企画', 'waiting', id, 7
from auth.users
where email = 'admin@example.com'
returning id;
```

返されたIDを `DEFAULT_EVENT_ID` に設定します。`auth.users` に指定したメールアドレスが存在しない場合、イベントは作成されません。

環境変数:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_EVENT_ID=
QUESTION_IMAGE_BUCKET=question-images
```

`DEFAULT_EVENT_ID` には作成した `event_settings.id` のUUIDを指定します。未設定・不正なUUIDの場合、参加先が設定されていないエラーになります。サーバー専用の `SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` を付けないでください。

## ローカル開発

`.env.local` にSupabaseの接続情報、`DEFAULT_EVENT_ID`、ローカル管理者用の `LOCAL_ADMIN_EMAIL` と `LOCAL_ADMIN_PASSWORD` を設定します。後者は6文字以上のパスワードを使用してください。`.env.local` はGitに登録しません。

```bash
npm install
npm run supabase:start
npm run dev
```

`npm run supabase:start` はローカルDBを起動し、ローカル管理者を作成します。初回はこの管理者が所有する `event_settings` 行を作成し、そのIDを `.env.local` の `DEFAULT_EVENT_ID` に設定してください。既存DBからの移行ではマイグレーションが解答・成績を保持します。

確認:

```bash
npm test
npm run build
```

以前のルーム作成版のコードは `basic/rooms`、番号なしエントリーでルームDBを持つ版は `basic/default-room-entry` に保存しています。それぞれ旧DB構造を使用するため、切り替えて実行するときは別のDB環境を使ってください。
