# NazoApp 要件定義書: 解答時ローカルタイマー要件

## 1. 文書の目的

この文書は、NazoApp のMVP完成後フェーズにおいて、**解答時の公平性を高めるためのローカルタイマー要件**を定義する。

本要件は、Git上で独立ブランチとして開発することを前提とする。

- 対象ブランチ例: `feature/local-answer-timer`
- 対象機能: 問題表示後のローカルタイマー計測、回答時間送信、保存、ランキング反映
---

## 2. 背景

現在のMVPでは、問題の配信や表示は実現されているが、通信速度や端末性能の違いにより、参加者ごとに問題を受信・表示するタイミングが異なる。

サーバー側の問題開始時刻を基準に回答時間を計測すると、以下のような不公平が発生する。

```txt
参加者A: 問題を即時受信 → 10秒で回答
参加者B: 通信遅延で3秒後に受信 → 実質7秒しか考えられない
```

この問題を軽減するため、各クライアントが問題を表示したタイミングを基準にローカルタイマーを開始し、回答までの経過時間をサーバーに送信・保存する。

---

## 3. 目的

本要件の目的は以下である。

1. 通信遅延による回答時間の不公平を軽減する
2. 問題が画面に表示された時点から回答時間を計測する
3. 回答時にローカル経過時間をサーバーへ送信する
4. サーバー側で回答経過時間を保存する
5. 正答者ランキングを回答経過時間順に並べられるようにする
6. 不正または異常な回答時間を最低限検証する

---

## 4. スコープ

## 4.1 対象範囲

本ブランチで実装する対象は以下。

- 問題受信後、問題表示時点でローカルタイマーを開始する
- `performance.now()` を用いて回答経過時間を計測する
- 回答送信APIに `answerElapsedMs` を含める
- サーバー側で `answerElapsedMs` を検証する
- 回答テーブルに回答経過時間を保存する
- ランキングまたは結果表示で回答経過時間を利用可能にする
- 回答時間の表示形式を整える
- 制限時間超過・重複回答などの異常系を扱う

## 4.2 対象外

以下は本ブランチでは実装しない。
- 完全なチート対策
- WebSocket遅延の厳密補正
- 全端末の完全同期
- サーバー署名付きトークン方式
- 参加者ごとの詳細な遅延測定
- ネイティブアプリ対応

---

## 5. 用語定義

| 用語 | 定義 |
|---|---|
| 問題受信時刻 | クライアントが問題データを受信した時刻 |
| 問題表示時刻 | クライアントが問題を画面に表示し、回答可能になった時刻 |
| ローカルタイマー | クライアント端末上で `performance.now()` を基準に計測するタイマー |
| 回答経過時間 | 問題表示時刻から回答操作までの経過時間 |
| `answerElapsedMs` | 回答経過時間をミリ秒単位で表した値 |
| `timeLimitMs` | 問題ごとの制限時間をミリ秒単位で表した値 |
| `graceMs` | 通信・描画・処理遅延を吸収するための猶予時間 |

---

## 6. 機能要件

## FR-001: 問題表示時にローカルタイマーを開始する

### 要件

クライアントは、問題データを受信した後、問題を画面に表示するタイミングでローカルタイマーを開始する。

タイマー開始には `Date.now()` ではなく `performance.now()` を使用する。

### 理由

`Date.now()` は端末のシステム時刻変更の影響を受ける可能性がある。  
一方、`performance.now()` はページロードからの単調増加時間を返すため、経過時間計測に適している。

### 実装例

```ts
const questionVisibleAt = performance.now();
```

---

## FR-002: 問題表示とタイマー開始を同じ処理フローで行う

### 要件

問題本文、選択肢、回答欄などを表示する処理と、ローカルタイマー開始時刻の保存を同一フローで行う。

### 実装例

```ts
function onQuestionReceived(question) {
  const visibleAt = performance.now();

  setCurrentQuestion(question);
  setQuestionVisibleAt(visibleAt);
  setIsQuestionVisible(true);
}
```

### 補足

React等の状態更新は非同期で反映される場合がある。  
そのため、実装上は「問題表示処理に入る直前または同一イベント内」で `performance.now()` を記録する。

---

## FR-003: 回答操作時に回答経過時間を算出する

### 要件

参加者が回答ボタンを押した時点で、以下の計算により回答経過時間を算出する。

```ts
const answerElapsedMs = Math.round(performance.now() - questionVisibleAt);
```

### 条件

- `questionVisibleAt` が存在しない場合は回答送信を行わない
- 算出値は整数のミリ秒とする
- 算出値が負数または `NaN` の場合は送信しない

---

## FR-004: 回答送信APIに `answerElapsedMs` を含める

### 要件

回答送信時、クライアントは回答内容とともに `answerElapsedMs` をサーバーへ送信する。

### Request例

```json
{
  "roomId": "1234ID",
  "participantId": "participant-uuid",
  "questionId": "question-uuid",
  "answer": "回答内容",
  "answerElapsedMs": 8350
}
```

### 必須項目

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `roomId` | string | Yes | ルームID |
| `participantId` | string | Yes | 参加者ID |
| `questionId` | string | Yes | 問題ID |
| `answer` | string | Yes | 回答内容 |
| `answerElapsedMs` | number | Yes | 問題表示から回答までの経過時間 |

---

## FR-005: サーバー側で `answerElapsedMs` を検証する

### 要件

サーバーは、クライアントから送信された `answerElapsedMs` を保存前に検証する。

### 検証条件

以下をすべて満たす場合のみ有効な回答として扱う。

- `answerElapsedMs` が存在する
- `answerElapsedMs` が数値である
- `answerElapsedMs` が整数である
- `answerElapsedMs >= 0`
- `answerElapsedMs <= timeLimitMs + graceMs`
- 対象ルームが存在する
- 対象参加者がルームに所属している
- 対象問題が現在回答受付中である
- 同一参加者が同一問題にまだ回答していない

### 推奨値

```txt
graceMs = 1000
```

---

## FR-006: 回答テーブルに回答経過時間を保存する

### 要件

回答データには、ローカルで計測した回答経過時間を保存する。

### DB変更案

既存の `answers` テーブルに以下のカラムを追加する。

```sql
ALTER TABLE public.answers
ADD COLUMN answer_elapsed_ms integer;
```

必要に応じて、サーバー受信時刻も保存する。

```sql
ALTER TABLE public.answers
ADD COLUMN server_received_at timestamptz DEFAULT now();
```

### 保存単位

- 単位: ミリ秒
- 型: integer
- 例: `8350` は 8.35秒を意味する

---

## FR-007: 同一参加者・同一問題への重複回答を防止する

### 要件

同一参加者が同一問題に複数回回答できないようにする。

### DB制約案

```sql
CREATE UNIQUE INDEX IF NOT EXISTS answers_unique_participant_question
ON public.answers (participant_id, question_id);
```

既存スキーマ上で `room_id` も必要な場合は、以下を検討する。

```sql
CREATE UNIQUE INDEX IF NOT EXISTS answers_unique_room_participant_question
ON public.answers (room_id, participant_id, question_id);
```

---

## FR-008: ランキングは正答者を回答経過時間順に並べる

### 要件

問題ごとのランキングは、以下の優先順位で決定する。

1. 正答している
2. `answer_elapsed_ms` が短い
3. 同一 `answer_elapsed_ms` の場合は `server_received_at` が早い
4. それでも同一の場合は既存の安定ソート条件に従う

### SQLイメージ

```sql
SELECT *
FROM answers
WHERE question_id = :question_id
ORDER BY
  is_correct DESC,
  answer_elapsed_ms ASC,
  server_received_at ASC;
```

### 補足

ランキング画面で誤答者を表示する場合は、正答者より下位に表示する。  
誤答者の並び順は既存仕様に従ってよい。

---

## FR-009: 画面上に回答時間を表示する

### 要件

回答後またはランキング表示時に、回答時間を秒単位で表示できるようにする。

### 表示例

```txt
8.35秒
```

### 変換例

```ts
function formatElapsedTime(answerElapsedMs: number): string {
  return `${(answerElapsedMs / 1000).toFixed(2)}秒`;
}
```

---

## FR-010: タイムアップ時は回答操作を無効化する

### 要件

クライアントはローカルタイマーを基準に制限時間を判定し、制限時間を超えた場合は回答ボタンを無効化する。

### 実装例

```ts
const elapsedMs = performance.now() - questionVisibleAt;
const remainingMs = Math.max(0, timeLimitMs - elapsedMs);

if (remainingMs <= 0) {
  disableAnswerInput();
}
```

### 補足

クライアント側の無効化はUX上の制御であり、最終的な有効・無効判定はサーバー側でも行う。

---

## FR-011: タイマー表示はローカル基準で更新する

### 要件

画面上の残り時間表示は、ローカルタイマーを基準に更新する。

### 推奨更新間隔

```txt
100ms〜250ms
```

### 理由

内部計測は高精度で行い、画面描画は必要十分な頻度に抑えることで、端末負荷を避ける。

---

## FR-012: 問題中のリロードに対する扱いを定義する

### 要件

問題表示中にページをリロードした場合、以下の仕様とする。

```txt
リロード後に現在の問題を再取得できた場合、その端末では再表示時点からローカルタイマーを開始する。
ただし、サーバー側で回答受付期間が終了している場合は回答不可とする。
```

### 補足

この仕様では、リロードによるタイマーリセットの余地がある。  
ただし、本ブランチでは完全なチート対策は対象外とし、サーバー側の回答受付状態と制限時間検証で最低限対応する。

---

## 7. 非機能要件

## NFR-001: 通信遅延による不公平を軽減すること

回答時間は、サーバー配信時刻ではなく、各端末で問題が表示された時点を基準に計測する。

---

## NFR-002: システム時刻に依存しないこと

回答速度の計測には `Date.now()` を使用しない。  
`performance.now()` を使用する。

---

## NFR-003: 画面描画に過度な負荷をかけないこと

タイマーの内部計測はミリ秒単位で行ってよいが、画面表示の更新頻度は 100ms〜250ms 程度に抑える。

---

## NFR-004: サーバー側で最低限の不正値検証を行うこと

クライアントから送信された `answerElapsedMs` は改ざん可能である。  
そのため、サーバー側で以下を検証する。

- 未送信ではない
- 数値である
- 整数である
- 0以上である
- 制限時間と猶予時間の合計を超えていない
- 参加者・ルーム・問題の整合性が取れている
- 重複回答ではない

---

## NFR-005: 既存のMVP動作を壊さないこと

本実装により、以下の既存機能を破壊してはならない。

- ルーム作成
- 参加者の入室
- 問題表示
- 回答送信
- 正誤判定
- 結果表示
- 管理画面の基本動作

---

## 8. API設計

## 8.1 回答送信API

既存の回答送信APIがある場合は、そのAPIに `answerElapsedMs` を追加する。  
API名が異なる場合は、既存実装に合わせる。

### Endpoint例

```txt
POST /api/answer
```

または

```txt
POST /api/rooms/[roomId]/answers
```

### Request

```json
{
  "roomId": "1234ID",
  "participantId": "participant-uuid",
  "questionId": "question-uuid",
  "answer": "回答内容",
  "answerElapsedMs": 8350
}
```

### Response: 成功

```json
{
  "success": true,
  "isCorrect": true,
  "answerElapsedMs": 8350
}
```

### Response: 回答時間不正

```json
{
  "success": false,
  "error": "ANSWER_TIME_INVALID"
}
```

### Response: 制限時間超過

```json
{
  "success": false,
  "error": "ANSWER_TIME_EXCEEDED"
}
```

### Response: 重複回答

```json
{
  "success": false,
  "error": "DUPLICATE_ANSWER"
}
```

---

## 8.2 エラーコード

| エラーコード | 意味 |
|---|---|
| `ANSWER_TIME_INVALID` | `answerElapsedMs` が未送信、不正型、負数、NaNなど |
| `ANSWER_TIME_EXCEEDED` | 制限時間 + 猶予時間を超過 |
| `DUPLICATE_ANSWER` | 同一参加者が同一問題に回答済み |
| `QUESTION_NOT_ACTIVE` | 対象問題が回答受付中ではない |
| `PARTICIPANT_NOT_FOUND` | 参加者が存在しない |
| `ROOM_NOT_FOUND` | ルームが存在しない |
| `ANSWER_SUBMIT_FAILED` | その他の回答送信失敗 |

---

## 9. データ設計

## 9.1 `answers` テーブル変更

### 追加カラム

```sql
ALTER TABLE public.answers
ADD COLUMN IF NOT EXISTS answer_elapsed_ms integer;
```

### 推奨追加カラム

```sql
ALTER TABLE public.answers
ADD COLUMN IF NOT EXISTS server_received_at timestamptz DEFAULT now();
```

---

## 9.2 制約

```sql
CREATE UNIQUE INDEX IF NOT EXISTS answers_unique_participant_question
ON public.answers (participant_id, question_id);
```

既存のデータモデルで同一 `question_id` が複数ルームで再利用される可能性がある場合は、以下を使用する。

```sql
CREATE UNIQUE INDEX IF NOT EXISTS answers_unique_room_participant_question
ON public.answers (room_id, participant_id, question_id);
```

---

## 9.3 型と値の扱い

| 項目 | 内容 |
|---|---|
| カラム名 | `answer_elapsed_ms` |
| API項目名 | `answerElapsedMs` |
| 型 | integer |
| 単位 | ミリ秒 |
| 最小値 | 0 |
| 最大値 | `timeLimitMs + graceMs` |
| 表示 | 秒に変換し、小数第2位まで表示 |

---

## 10. クライアント実装方針

## 10.1 状態管理

必要な状態の例。

```ts
const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
const [questionVisibleAt, setQuestionVisibleAt] = useState<number | null>(null);
const [remainingMs, setRemainingMs] = useState<number | null>(null);
const [hasAnswered, setHasAnswered] = useState(false);
```

---

## 10.2 問題受信時

```ts
function handleQuestionReceived(question: Question) {
  const visibleAt = performance.now();

  setCurrentQuestion(question);
  setQuestionVisibleAt(visibleAt);
  setHasAnswered(false);
}
```

---

## 10.3 タイマー更新

```ts
useEffect(() => {
  if (!currentQuestion || questionVisibleAt === null) return;

  const intervalId = window.setInterval(() => {
    const elapsedMs = performance.now() - questionVisibleAt;
    const nextRemainingMs = Math.max(0, currentQuestion.timeLimitMs - elapsedMs);

    setRemainingMs(nextRemainingMs);

    if (nextRemainingMs <= 0) {
      window.clearInterval(intervalId);
    }
  }, 100);

  return () => window.clearInterval(intervalId);
}, [currentQuestion, questionVisibleAt]);
```

---

## 10.4 回答送信時

```ts
async function submitAnswer(answer: string) {
  if (!currentQuestion) return;
  if (questionVisibleAt === null) return;
  if (hasAnswered) return;

  const answerElapsedMs = Math.round(performance.now() - questionVisibleAt);

  if (!Number.isFinite(answerElapsedMs)) return;
  if (answerElapsedMs < 0) return;

  setHasAnswered(true);

  const response = await fetch("/api/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomId,
      participantId,
      questionId: currentQuestion.id,
      answer,
      answerElapsedMs
    })
  });

  if (!response.ok) {
    setHasAnswered(false);
  }
}
```

---

## 11. サーバー実装方針

## 11.1 入力検証

```ts
function validateAnswerElapsedMs(
  answerElapsedMs: unknown,
  timeLimitMs: number,
  graceMs: number
): boolean {
  if (typeof answerElapsedMs !== "number") return false;
  if (!Number.isInteger(answerElapsedMs)) return false;
  if (!Number.isFinite(answerElapsedMs)) return false;
  if (answerElapsedMs < 0) return false;
  if (answerElapsedMs > timeLimitMs + graceMs) return false;

  return true;
}
```

---

## 11.2 保存処理

保存時には以下を含める。

```ts
{
  room_id: roomId,
  participant_id: participantId,
  question_id: questionId,
  answer,
  is_correct: isCorrect,
  answer_elapsed_ms: answerElapsedMs,
  server_received_at: new Date().toISOString()
}
```

---

## 11.3 重複回答時の扱い

同一参加者・同一問題への回答がすでに存在する場合は、2回目以降を拒否する。

```json
{
  "success": false,
  "error": "DUPLICATE_ANSWER"
}
```

---

## 12. 受け入れ条件

## AC-001: 問題表示時にタイマーが開始される

### 条件

問題を受信し、画面に表示する。

### 期待結果

問題表示と同時に `questionVisibleAt` が `performance.now()` で記録される。

---

## AC-002: 回答時に `answerElapsedMs` が算出される

### 条件

問題表示から約5秒後に回答する。

### 期待結果

送信される `answerElapsedMs` が約5000になる。

許容範囲の目安。

```txt
4500 <= answerElapsedMs <= 5500
```

---

## AC-003: 回答APIに `answerElapsedMs` が送信される

### 条件

任意の問題に回答する。

### 期待結果

回答送信リクエストに `answerElapsedMs` が含まれる。

---

## AC-004: サーバーに `answer_elapsed_ms` が保存される

### 条件

回答送信が成功する。

### 期待結果

`answers.answer_elapsed_ms` にミリ秒単位の値が保存される。

---

## AC-005: 負数や不正型の回答時間は拒否される

### 条件

以下のような値を送信する。

```json
{
  "answerElapsedMs": -1
}
```

または

```json
{
  "answerElapsedMs": "1000"
}
```

### 期待結果

サーバーは `ANSWER_TIME_INVALID` を返す。

---

## AC-006: 制限時間を超えた回答は拒否される

### 条件

`timeLimitMs = 30000`、`graceMs = 1000` のとき、`answerElapsedMs = 32000` を送信する。

### 期待結果

サーバーは `ANSWER_TIME_EXCEEDED` を返す。

---

## AC-007: 同一問題への重複回答は拒否される

### 条件

同一参加者が同一問題に2回回答する。

### 期待結果

1回目は保存される。  
2回目は `DUPLICATE_ANSWER` で拒否される。

---

## AC-008: 正答者ランキングが回答時間順になる

### 条件

同じ問題に複数参加者が正答する。

### 期待結果

`answer_elapsed_ms` が短い順に表示される。

---

## AC-009: タイムアップ時に回答操作が無効化される

### 条件

問題表示後、制限時間が経過する。

### 期待結果

回答ボタンまたは回答入力欄が無効化される。

---

## AC-010: 既存の基本機能が壊れていない

### 条件

通常のルーム作成、参加、問題表示、回答を行う。

### 期待結果

既存MVPの基本動作が維持される。

---

## 13. テスト項目

## 13.1 単体テスト

| No | 対象 | 条件 | 期待結果 |
|---:|---|---|---|
| 1 | `formatElapsedTime` | `8350` | `8.35秒` |
| 2 | `validateAnswerElapsedMs` | `1000` | valid |
| 3 | `validateAnswerElapsedMs` | `-1` | invalid |
| 4 | `validateAnswerElapsedMs` | `"1000"` | invalid |
| 5 | `validateAnswerElapsedMs` | `NaN` | invalid |
| 6 | `validateAnswerElapsedMs` | `timeLimitMs + graceMs + 1` | invalid |

---

## 13.2 結合テスト

| No | 条件 | 操作 | 期待結果 |
|---:|---|---|---|
| 1 | 問題表示後5秒 | 回答する | `answerElapsedMs` が約5000で保存される |
| 2 | 問題表示後即時 | 回答する | 小さい正の値が保存される |
| 3 | 制限時間超過 | 回答する | 回答が拒否される |
| 4 | 同一問題に連打 | 複数回送信 | 1件のみ保存される |
| 5 | 複数参加者が正答 | 結果表示 | 回答時間が短い順に並ぶ |
| 6 | 誤答者あり | 結果表示 | 正答者が上位に表示される |

---

## 13.3 手動テスト

| No | 観点 | 手順 | 期待結果 |
|---:|---|---|---|
| 1 | 通常回答 | 問題表示後に回答 | 回答時間が表示される |
| 2 | 遅延環境 | DevToolsでNetwork Slow 3Gを設定 | 問題表示後からタイマーが始まる |
| 3 | タイムアップ | 制限時間まで待つ | 回答不可になる |
| 4 | リロード | 問題中にリロード | 再表示後の仕様どおり動作する |
| 5 | ランキング | 複数人で回答 | 正答かつ回答時間順に表示される |

---

## 14. 実装タスク分解

## Task 1: DBマイグレーション追加

- `answers.answer_elapsed_ms` を追加
- 必要に応じて `answers.server_received_at` を追加
- 重複回答防止の unique index を追加
- Supabaseを使用している場合は、既存の `supabase/schema.sql` または migration に反映する

---

## Task 2: クライアント側タイマー状態の追加

- `questionVisibleAt` を状態として追加
- 問題表示時に `performance.now()` を保存
- 回答済み状態 `hasAnswered` を管理
- 制限時間切れ状態を管理

---

## Task 3: 回答送信処理の修正

- 回答時に `answerElapsedMs` を算出
- APIリクエストに `answerElapsedMs` を追加
- 不正値の場合は送信しない
- 送信中の二重送信を防ぐ

---

## Task 4: サーバー側回答APIの修正

- Request bodyから `answerElapsedMs` を取得
- 型・範囲チェックを実装
- 参加者・ルーム・問題の整合性を確認
- 重複回答を拒否
- `answer_elapsed_ms` を保存

---

## Task 5: ランキング・結果表示の修正

- `answer_elapsed_ms` を取得対象に含める
- 正答者を回答時間昇順で並べる
- 秒表示に整形する
- 同値の場合の並び順を安定化する

---

## Task 6: テスト追加

- バリデーション関数の単体テスト
- 回答APIの結合テスト
- ランキング順のテスト
- タイムアップ時のテスト
- 手動確認手順の追記

---

## 15. 実装上の注意

## 15.1 `performance.now()` の値はサーバーに直接保存しない

保存するのは `performance.now()` の絶対値ではなく、差分である `answerElapsedMs` のみとする。

悪い例。

```ts
questionVisibleAt = performance.now();
send(questionVisibleAt);
```

良い例。

```ts
answerElapsedMs = performance.now() - questionVisibleAt;
send(answerElapsedMs);
```

---

## 15.2 クライアントの値は信用しすぎない

`answerElapsedMs` はクライアント側で生成されるため、改ざん可能である。  
本フェーズでは完全な不正対策は行わないが、最低限の検証は必ずサーバー側で行う。

---

## 15.3 制限時間の最終判定はサーバーでも行う

クライアント側でタイムアップ表示をしても、APIを直接叩かれる可能性がある。  
そのため、サーバー側で `answerElapsedMs <= timeLimitMs + graceMs` を検証する。

---

## 15.4 既存コードのAPI名・テーブル名に合わせる

この文書では例として `/api/answer`、`answers`、`answer_elapsed_ms` を使用している。  
既存実装で名称が異なる場合は、既存命名に合わせること。

ただし、APIのJSON項目名はフロントエンドでは `answerElapsedMs`、DBカラムでは `answer_elapsed_ms` を推奨する。

---

## 16. 完了条件

本ブランチは、以下を満たした時点で完了とする。

- 問題表示時点でローカルタイマーが開始される
- 回答時に `answerElapsedMs` が算出される
- 回答APIに `answerElapsedMs` が送信される
- サーバー側で `answerElapsedMs` が検証される
- 回答テーブルに `answer_elapsed_ms` が保存される
- 正答者ランキングが `answer_elapsed_ms` 昇順になる
- 制限時間超過の回答が拒否される
- 同一問題への重複回答が拒否される
- 既存MVPの主要動作が維持される

---

## 17. Codexへの作業指示サマリー

以下の方針で実装すること。

```txt
このブランチでは、解答時ローカルタイマー機能のみを実装する。
/play/[roomId] から /join へのリダイレクト改善は対象外。

問題がクライアント画面に表示されるタイミングで performance.now() を保存し、
回答操作時に performance.now() との差分を answerElapsedMs として算出する。

回答送信APIには answerElapsedMs を追加する。
サーバー側では answerElapsedMs の型・範囲・制限時間超過・重複回答を検証する。
DBには answer_elapsed_ms を保存する。
ランキングでは正答者を answer_elapsed_ms の昇順で並べる。

既存のルーム作成、参加、問題表示、回答送信、正誤判定を壊さないこと。
```
