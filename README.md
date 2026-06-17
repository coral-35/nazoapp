# 謎解き企画アプリ MVP

ルーム参加型の謎解き企画用Webアプリです。参加者はルーム番号と名前で参加し、出題者が開始した問題画像を見て解答します。正誤判定と得点加算はサーバー側で行い、参加者側レスポンスに正答文字列を返しません。

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
```

`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用です。`NEXT_PUBLIC_` を付けないでください。

## Supabase準備

1. Supabaseでプロジェクトを作成します。
2. Authenticationで出題者用ユーザーを作成します。
3. SQL Editorで [supabase/schema.sql](supabase/schema.sql) を実行します。
4. `question-images` Storageバケットが作成されます。MVPではAPIがservice roleでアップロードし、参加者へは現在問題の署名付きURLのみ返します。
5. `.env.local` にURL、anon key、service role keyを設定します。

## 主要画面

- `/` トップ
- `/join` 参加者のルーム参加
- `/play/[roomCode]` 参加者の問題解答
- `/admin/login` 出題者ログイン
- `/admin/rooms` ルーム一覧・作成
- `/admin/rooms/[roomId]` 問題登録、開始、締切、得点確認

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
2. `/admin/rooms` でルームを作成し、発行されたルーム番号を確認します。
3. ルーム詳細で問題画像、正答、配点を登録します。
4. `/join` でルーム番号と参加者名を入力して参加します。
5. 出題者画面で問題を開始します。
6. 参加者画面に問題画像が表示されることを確認します。
7. 誤答を送信し、不正解で得点が増えないことを確認します。
8. 正答を送信し、得点が加算されることを確認します。
9. 同じ問題に再度正答しても得点が二重加算されないことを確認します。
10. 出題者画面で締切し、参加者が解答できないことを確認します。

## セキュリティ上の注意

- 参加者向けAPIは正答文字列を返しません。
- 正答判定と得点加算は `submit-answer` のサーバー処理で行います。
- `score_events` の `participant_id + question_id` 一意制約で二重加点を防ぎます。
- 管理APIはSupabase AuthのBearerトークンを検証します。
- RLSを有効化し、ブラウザからテーブルを直接読ませない前提です。
