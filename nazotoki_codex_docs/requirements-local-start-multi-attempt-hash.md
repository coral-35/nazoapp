# NazoApp 要件定義書: ローカル開始・複数回解答・正解ハッシュ化

## 1. 文書の目的

この文書は、NazoApp のローカルタイマー実装後に発生した追加修正要件を、Codex に一度で渡せる形で定義する。

本要件では、既存の「問題表示時にローカルタイマーを開始し、回答時間を保存する」実装を発展させ、以下を実現する。

1. 問題取得後、問題文・問題画像を隠した状態で開始ボタンを表示する
2. 開始ボタン押下時に、問題表示とタイマー開始を同時に行う
3. 解答可能回数の上限を問題ごとに設定できるようにする
4. 開始後の複数回解答をローカルで処理する
5. 最初に正解したタイミング、またはタイムアップ・回数上限到達時点で最終結果を確定する
6. 問題取得と最終結果送信のみをAPI通信とし、回答試行ごとのAPI通信を行わない
7. ページ更新時に、開始前・開始後・完了後の状態を可能な範囲で復元する
8. ローカル判定用の正解文字列を直接クライアントへ渡さず、SHA-256ハッシュで渡す

---

## 2. 背景

既存実装では、問題が表示された時点で `performance.now()` を保存し、回答送信時に `answerElapsedMs` を算出してAPIへ送信している。

しかし、以下の課題が残っている。

- 問題データ取得直後に問題文や画像が表示されると、参加者が準備する前に問題を見られる
- 画像読み込みが完了する前にタイマーが進む可能性がある
- 複数回回答を許可する問題に対応しにくい
- 回答ごとにAPI通信を行うと、通信状況が回答体験に影響する
- ローカル判定のために正解文字列をAPIで返すと、F12のNetworkタブ等から正解が直接見える
- ページ更新時にタイマー状態が失われると、体験上も公平性上も問題が出る

本修正では、問題取得後に開始ボタンを表示し、参加者が開始したタイミングからローカルでプレイを完結させる。  
また、正解文字列の直接露出を避けるため、ローカル判定には正解文字列ではなく正解ハッシュを使用する。

---

## 3. 基本方針

本修正後のプレイフローは以下とする。

```txt
API通信: 問題取得
  ↓
クライアント: 問題データ・画像を準備
  ↓
クライアント: 問題文・問題画像を隠した開始前画面を表示
  ↓
参加者: 開始ボタンを押す
  ↓
クライアント: 問題表示 + タイマー開始
  ↓
クライアント: 複数回解答・ローカル正誤判定・回数制限・タイムアップ判定
  ↓
クライアント: 最初に正解、またはタイムアップ・回数上限到達で最終結果確定
  ↓
API通信: 最終結果を1回だけ送信
```

---

## 4. 対象範囲

### 4.1 対象に含める

- 問題取得後、問題文・問題画像を隠した開始前画面を表示する
- 開始ボタン押下時に問題表示とタイマー開始を行う
- 問題画像の事前読み込み
- 解答可能回数上限の設定
- 複数回解答のローカル処理
- 正解ハッシュによるローカル判定
- 正解文字列のAPIレスポンス直接露出防止
- 最初に正解した時点の経過時間記録
- タイムアップ時の失敗結果記録
- 解答回数上限到達時の失敗結果記録
- 最終結果のAPI送信
- ページ更新時の状態復元
- `submissions` テーブルへの最終結果保存
- 管理画面での解答可能回数設定
- 既存ランキング表示への反映

### 4.2 対象外

- 完全なチート対策
- WebSocket遅延の厳密補正
- サーバー署名付きトークン方式
- 解答中の各試行を毎回サーバー送信する方式
- 問題開始時刻を必ずサーバーに保存する方式
- ネイティブアプリ対応
- `/join` リダイレクト改善
- 選択肢式や短い答えに対する総当たり防止

---

## 5. 用語定義

| 用語 | 定義 |
|---|---|
| 問題取得 | APIから問題データを取得すること |
| 開始前状態 | 問題データは取得済みだが、まだタイマーが開始していない状態 |
| 開始ボタン | 参加者が押すことで問題表示とタイマー開始を行うボタン |
| ローカルプレイセッション | 問題開始から正解・タイムアップ・回数上限到達までのクライアント内状態 |
| 解答試行 | 参加者が回答を入力し、ローカルで判定する1回の操作 |
| 解答可能回数 | 1問に対して参加者が回答を試行できる最大回数 |
| 最終結果 | 正解、タイムアップ、または解答回数上限到達によって確定した結果 |
| `answerElapsedMs` | 問題開始から最初に正解するまでの経過時間。タイムアップ時は制限時間相当の値 |
| `attemptCount` | 実際に行った解答試行回数 |
| `finalStatus` | 最終結果。`correct`, `timeout`, `attempt_limit_exceeded` |
| 正解ハッシュ | 正規化済み正解文字列をSHA-256でハッシュ化した値 |
| 正規化 | trim、小文字化、全角半角統一など、回答比較前に行う文字列整形 |

---

# 6. 機能要件

## FR-001: 問題取得後、問題を隠した開始前画面を表示する

### 要件

クライアントは、問題データをAPIから取得した直後に問題文や問題画像を表示しない。

代わりに、以下のような開始前画面を表示する。

```txt
準備ができたら開始してください
[問題を表示して開始]
```

### 開始前画面で表示してよいもの

- ルーム名
- 参加者名
- 問題番号
- 制限時間
- 解答可能回数
- 開始ボタン

### 開始前画面で表示してはならないもの

- 問題文
- 問題画像
- 選択肢
- 正解に関係する情報
- 回答入力欄
- 正解ハッシュ

---

## FR-002: 問題画像を開始前に事前読み込みする

### 要件

問題に画像がある場合、開始ボタンを有効化する前に画像を事前読み込みする。

### 理由

開始ボタン押下後に画像読み込みが始まると、タイマーは進んでいるのに問題画像が見えない状態が発生するため。

### 推奨仕様

- 問題画像URLがある場合、`Image` オブジェクト等でプリロードする
- 画像読み込み完了後に開始ボタンを有効化する
- 画像読み込み中は開始ボタンを無効化する
- 画像読み込み失敗時はエラー表示する

### エラー表示例

```txt
問題画像の読み込みに失敗しました。再読み込みしてください。
```

---

## FR-003: 開始ボタン押下時に問題表示とタイマー開始を同時に行う

### 要件

参加者が開始ボタンを押した時点で、以下を同一処理フローで行う。

1. 問題文を表示する
2. 問題画像を表示する
3. 回答入力欄を表示する
4. タイマーを開始する
5. 開始済み状態を保存する

### 実装例

```ts
function startQuestion() {
  const startedAtPerf = performance.now();
  const startedAtWall = Date.now();

  setQuestionStartedAtPerf(startedAtPerf);
  setQuestionStartedAtWall(startedAtWall);
  setQuestionState("active");
  setIsQuestionVisible(true);

  persistQuestionSession({
    status: "active",
    roomCode,
    participantId,
    questionId,
    startedAtWallMs: startedAtWall,
    deadlineAtWallMs: startedAtWall + timeLimitMs,
    timeLimitMs,
    maxAttempts,
    attemptCount: 0,
    attempts: []
  });
}
```

---

## FR-004: 解答可能回数を問題ごとに設定できるようにする

### 要件

管理画面で、問題ごとに解答可能回数の上限を設定できるようにする。

### 推奨カラム

```sql
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 1;
```

### バリデーション

`max_attempts` は以下を満たす。

- 整数
- 1以上
- 推奨上限: 99以下

### 管理画面表示例

```txt
解答可能回数: [ 3 ] 回
```

未入力の場合は `1` とする。

---

## FR-005: 問題取得APIはローカル判定に必要な情報を返す

### 要件

問題取得APIは、ローカルで正誤判定できるだけの情報を返す。  
ただし、正解文字列そのものは返さない。

### Response例

```json
{
  "questionId": "question-uuid",
  "questionText": "問題文",
  "questionImageUrl": "https://example.com/question.png",
  "answerType": "text",
  "choices": null,
  "timeLimitMs": 30000,
  "maxAttempts": 3,
  "validation": {
    "mode": "local_hash",
    "type": "exact",
    "correctAnswerHashes": [
      "sha256-hash-string"
    ],
    "caseSensitive": false,
    "trimWhitespace": true,
    "normalizeWidth": true,
    "normalizeKana": false
  },
  "serverNowMs": 1760000000000
}
```

### レスポンスに含めてよいもの

- `validation.mode`
- `validation.type`
- `validation.correctAnswerHashes`
- `validation.caseSensitive`
- `validation.trimWhitespace`
- `validation.normalizeWidth`
- `validation.normalizeKana`
- `timeLimitMs`
- `maxAttempts`

### レスポンスに含めてはいけないもの

- `correctAnswer`
- `correctAnswers`
- `answer`
- `answers`
- `solution`
- `expectedAnswer`
- その他、正解文字列そのもの

---

## FR-006: 正解文字列はSHA-256ハッシュ化して返す

### 要件

問題取得APIは、DBに保存されている正解文字列を直接返さない。

代わりに、以下の手順で正解ハッシュを生成して返す。

1. 正解文字列を取得する
2. 正規化する
3. SHA-256でハッシュ化する
4. `correctAnswerHashes` として返す

### サーバー側実装例

```ts
import crypto from "crypto";

function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function buildCorrectAnswerHashes(correctAnswers: string[]): string[] {
  return correctAnswers.map((answer) => sha256(normalizeAnswer(answer)));
}
```

---

## FR-007: クライアントはユーザー入力をハッシュ化して判定する

### 要件

クライアントは、ユーザーの入力値を正規化し、SHA-256でハッシュ化して、`correctAnswerHashes` に含まれるかを判定する。

### クライアント側実装例

```ts
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

async function isCorrectAnswer(
  userAnswer: string,
  correctAnswerHashes: string[]
): Promise<boolean> {
  const normalized = normalizeAnswer(userAnswer);
  const userHash = await sha256(normalized);

  return correctAnswerHashes.includes(userHash);
}
```

---

## FR-008: 複数正解に対応する

### 要件

複数の正解表記を許可する場合、サーバーはすべての許容正解をハッシュ化して返す。

### 例

```txt
正解候補:
- りんご
- リンゴ
- 林檎
```

### APIレスポンス例

```json
{
  "validation": {
    "mode": "local_hash",
    "type": "exact",
    "correctAnswerHashes": [
      "hash-of-answer-1",
      "hash-of-answer-2",
      "hash-of-answer-3"
    ],
    "caseSensitive": false,
    "trimWhitespace": true,
    "normalizeWidth": true
  }
}
```

---

## FR-009: 正規化ルールをサーバー・クライアントで一致させる

### 要件

サーバー側で正解をハッシュ化する前と、クライアント側でユーザー入力をハッシュ化する前に、同一の正規化処理を行う。

### 推奨正規化

```ts
function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}
```

### 注意

正規化ルールは、サーバー側とクライアント側で必ず一致させる。

サーバー側とクライアント側で正規化が異なると、正しい回答でも不正解になる可能性がある。

---

## FR-010: 問題開始後はローカルで複数回解答できる

### 要件

開始ボタン押下後、参加者は `maxAttempts` 回までローカルで回答を試行できる。

回答のたびにAPI通信は行わない。

### ローカル状態例

```ts
type LocalAttempt = {
  answer: string;
  elapsedMs: number;
  isCorrect: boolean;
};

type LocalQuestionSession = {
  status: "ready" | "active" | "completed" | "submitting" | "submitted";
  roomCode: string;
  participantId: string;
  questionId: string;
  timeLimitMs: number;
  maxAttempts: number;
  attemptCount: number;
  attempts: LocalAttempt[];
  startedAtWallMs?: number;
  deadlineAtWallMs?: number;
  correctElapsedMs?: number;
  finalStatus?: "correct" | "timeout" | "attempt_limit_exceeded";
  finalAnswer?: string | null;
  resultSubmitted?: boolean;
};
```

---

## FR-011: 最初に正解した時点で最終結果を確定する

### 要件

ローカル判定で正解となった場合、その時点で最終結果を確定する。

このとき記録する回答時間は、問題開始から最初に正解した時点までの経過時間とする。

### 処理例

```ts
const elapsedMs = Math.round(performance.now() - questionStartedAtPerf);

if (isCorrect) {
  finalizeResult({
    finalStatus: "correct",
    answerElapsedMs: elapsedMs,
    finalAnswer: answer,
    attemptCount,
    attempts
  });
}
```

### 注意

正解後は、追加回答できない。

---

## FR-012: 不正解の場合は残り回数があれば再回答できる

### 要件

回答が不正解であり、以下を満たす場合は再回答できる。

- タイムアップしていない
- `attemptCount < maxAttempts`
- 最終結果がまだ確定していない

### 表示例

```txt
不正解です。残り 2 回回答できます。
```

---

## FR-013: 解答可能回数に達した場合の扱い

### 推奨仕様

不正解のまま `maxAttempts` に達した場合、回答入力を無効化し、最終結果を `attempt_limit_exceeded` として確定する。

### 理由

上限到達後にタイムアウトまで待たせると、ページを閉じた場合に結果が送信されない可能性があるため。

### 送信内容

`attempt_limit_exceeded` は不正解終了として扱う。  
ランキングでは正答者より下位に表示する。

### 表示例

```txt
解答回数の上限に達しました。
```

---

## FR-014: タイムアップ時に最終結果を確定する

### 要件

制限時間が経過した場合、最終結果を `timeout` として確定する。

### 処理例

```ts
if (remainingMs <= 0 && session.status === "active") {
  finalizeResult({
    finalStatus: "timeout",
    answerElapsedMs: timeLimitMs,
    finalAnswer: lastAnswer ?? null,
    attemptCount,
    attempts
  });
}
```

### タイムアップ時の `answerElapsedMs`

タイムアップ時は、原則として `timeLimitMs` を保存する。  
実測値が `timeLimitMs` を若干超えていても、表示・ランキング上は制限時間ちょうどとして扱う。

---

## FR-015: 最終結果のみAPIへ送信する

### 要件

API通信は、以下の2回を基本とする。

1. 問題取得
2. 最終結果送信

回答試行ごとにAPI通信しない。

### 最終結果送信API Request例

```json
{
  "roomCode": "1234ID",
  "participantId": "participant-uuid",
  "questionId": "question-uuid",
  "finalStatus": "correct",
  "isCorrect": true,
  "finalAnswer": "正解",
  "answerElapsedMs": 8350,
  "attemptCount": 2,
  "maxAttempts": 3,
  "attempts": [
    {
      "answer": "不正解1",
      "elapsedMs": 3200,
      "isCorrect": false
    },
    {
      "answer": "正解",
      "elapsedMs": 8350,
      "isCorrect": true
    }
  ]
}
```

### 注意

`attempts` をDBに保存するかどうかは任意。  
最低限、`attemptCount`、`finalStatus`、`finalAnswer`、`answerElapsedMs` は保存する。

---

## FR-016: サーバー側でも最終結果を検証する

### 要件

サーバーは、クライアントから送信された最終結果をそのまま信用しすぎない。

最低限、以下を検証する。

- ルームが存在する
- 参加者が対象ルームに所属している
- 問題が対象ルームに紐づいている
- `answerElapsedMs` が数値・整数・0以上である
- `answerElapsedMs <= timeLimitMs + graceMs`
- `attemptCount` が数値・整数・0以上である
- `attemptCount <= maxAttempts`
- `finalStatus` が許可された値である
- `isCorrect = true` の場合、`finalAnswer` をサーバー側でも再判定する
- 同一参加者・同一問題への最終結果がすでに保存されていない

### `graceMs`

```txt
graceMs = 1000
```

---

## FR-017: サーバー側でも最終正誤を再判定する

### 要件

最終結果送信APIは、`finalStatus = "correct"` または `isCorrect = true` の場合、`finalAnswer` をサーバー側で正解判定する。

### 理由

クライアント側の `isCorrect` は改ざん可能なため。

### 判定方法

サーバー側では、DBに保存された正解文字列を使って再判定する。

```ts
const serverJudgedCorrect = correctAnswers
  .map(normalizeAnswer)
  .includes(normalizeAnswer(finalAnswer));
```

または、サーバー側でも同じハッシュ比較を行う。

```ts
const finalAnswerHash = sha256(normalizeAnswer(finalAnswer));
const serverJudgedCorrect = correctAnswerHashes.includes(finalAnswerHash);
```

### 注意

クライアントが送信した `isCorrect` は参考値として扱い、最終的な正誤はサーバー側判定を優先する。

---

## FR-018: `submissions` テーブルに最終結果を保存する

### 既存方針

回答保存先は `answers` ではなく、既存命名に合わせて `submissions` テーブルを使用する。

### 追加カラム案

```sql
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS final_status text;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 1;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS max_attempts_snapshot integer;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS final_answer text;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS client_started_at timestamptz;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS client_completed_at timestamptz;
```

既存で以下が追加済みなら再利用する。

```sql
-- 既存追加済み想定
answer_elapsed_ms integer
server_received_at timestamptz DEFAULT now()
```

### `final_status` の値

| 値 | 意味 |
|---|---|
| `correct` | 制限時間内に正解 |
| `timeout` | 正解前に制限時間到達 |
| `attempt_limit_exceeded` | 正解前に解答回数上限到達 |

---

## FR-019: 重複送信を防止する

### 要件

最終結果は、同一参加者・同一問題につき1回のみ保存する。

### DB制約案

```sql
CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_room_participant_question_final
ON public.submissions (room_id, participant_id, question_id);
```

既存データとの兼ね合いで即時適用が難しい場合は、条件付きindexを使用する。

```sql
CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_room_participant_question_final_completed
ON public.submissions (room_id, participant_id, question_id)
WHERE final_status IS NOT NULL;
```

---

## FR-020: ランキングは正解者の最初の正解時間を使う

### 要件

ランキングでは、`final_status = 'correct'` の参加者を正答者として扱う。

正答者の順位は以下の順で決定する。

1. `final_status = 'correct'`
2. `answer_elapsed_ms` 昇順
3. `server_received_at` 昇順

### 失敗者の扱い

`timeout` と `attempt_limit_exceeded` は不正解終了として扱う。  
必要に応じて正答者の下に表示する。

---

# 7. ページ更新時の状態復元要件

## FR-021: 開始前状態を復元する

### 要件

問題取得後、開始ボタンを押す前にページ更新した場合、再読み込み後も開始前状態に戻す。

### 保存する状態

```ts
{
  status: "ready",
  roomCode,
  participantId,
  questionId,
  timeLimitMs,
  maxAttempts
}
```

### 復元条件

- 保存済みの `questionId` が現在の問題と一致する
- `participantId` が一致する
- 最終結果が未送信である

### 復元結果

```txt
準備ができたら開始してください
[問題を表示して開始]
```

タイマーは進めない。

---

## FR-022: 開始後状態を復元する

### 要件

開始ボタン押下後にページ更新した場合、更新前の開始時刻を維持してタイマーを復元する。

### 保存する状態

```ts
{
  status: "active",
  roomCode,
  participantId,
  questionId,
  startedAtWallMs,
  deadlineAtWallMs,
  timeLimitMs,
  maxAttempts,
  attemptCount,
  attempts
}
```

### 復元ロジック

`performance.now()` はページ更新でリセットされるため、保存済みの `startedAtWallMs` または `deadlineAtWallMs` から経過時間を復元する。

```ts
const nowWallMs = Date.now();
const elapsedMs = nowWallMs - startedAtWallMs;
const remainingMs = Math.max(0, deadlineAtWallMs - nowWallMs);

const restoredStartedAtPerf = performance.now() - elapsedMs;
```

以降は、通常のタイマーと同様に `performance.now()` を使う。

```ts
const elapsedAfterRestore = performance.now() - restoredStartedAtPerf;
```

### 注意

この方式は、ユーザーが端末時刻を変更した場合に影響を受ける。  
完全な不正対策ではない。

---

## FR-023: 更新時に制限時間を過ぎていた場合はタイムアウト確定する

### 要件

ページ更新後に復元した結果、すでに `deadlineAtWallMs` を過ぎている場合は、問題を再開せず `timeout` として最終結果を確定する。

### 処理例

```ts
if (Date.now() >= deadlineAtWallMs) {
  finalizeResult({
    finalStatus: "timeout",
    answerElapsedMs: timeLimitMs,
    attemptCount,
    attempts
  });
}
```

---

## FR-024: 完了済み状態を復元する

### 要件

正解、タイムアウト、解答回数上限到達によって最終結果が確定済みの場合、更新後も完了済み画面を表示する。

### 保存する状態

```ts
{
  status: "completed",
  finalStatus,
  answerElapsedMs,
  attemptCount,
  finalAnswer,
  resultSubmitted
}
```

### 復元結果

- 送信済みなら結果画面を表示
- 未送信なら最終結果送信APIを再試行する

---

## FR-025: 状態保存先は `sessionStorage` を基本とする

### 要件

ローカルプレイセッションは、原則として `sessionStorage` に保存する。

### 理由

`localStorage` では複数タブ間で状態が共有されやすく、同じ参加者が別タブで問題を開いた場合に競合しやすい。

### 保存キー例

```ts
const key = `nazoapp:question-session:${roomCode}:${participantId}:${questionId}`;
```

### 補足

ブラウザ終了後も復元したい場合は `localStorage` を使う選択肢もある。  
ただし、本要件ではタブ単位の復元を優先し、`sessionStorage` を推奨する。

---

# 8. API設計

## 8.1 問題取得API

既存の `/api/current-question` を拡張する。

### Responseに追加する項目

```json
{
  "timeLimitMs": 30000,
  "maxAttempts": 3,
  "validation": {
    "mode": "local_hash",
    "type": "exact",
    "correctAnswerHashes": [
      "sha256-hash-string"
    ],
    "caseSensitive": false,
    "trimWhitespace": true,
    "normalizeWidth": true,
    "normalizeKana": false
  },
  "serverNowMs": 1760000000000
}
```

### 禁止事項

参加者向けの問題取得APIレスポンスに、正解文字列そのものを含めない。

禁止フィールド例:

```txt
correctAnswer
correctAnswers
answer
answers
solution
expectedAnswer
```

---

## 8.2 最終結果送信API

既存の `/api/submit-answer` を「回答ごとの送信」ではなく「最終結果送信」として扱う。

### Request

```json
{
  "roomCode": "1234ID",
  "participantId": "participant-uuid",
  "questionId": "question-uuid",
  "finalStatus": "correct",
  "isCorrect": true,
  "finalAnswer": "正解",
  "answerElapsedMs": 8350,
  "attemptCount": 2,
  "maxAttempts": 3
}
```

### Response: 成功

```json
{
  "success": true,
  "finalStatus": "correct",
  "isCorrect": true,
  "answerElapsedMs": 8350
}
```

### Response: エラー

```json
{
  "success": false,
  "error": "DUPLICATE_ANSWER"
}
```

---

## 8.3 エラーコード

| エラーコード | 意味 |
|---|---|
| `ANSWER_TIME_INVALID` | 回答時間が不正 |
| `ANSWER_TIME_EXCEEDED` | 回答時間が制限時間を超過 |
| `ATTEMPT_COUNT_INVALID` | 解答回数が不正 |
| `ATTEMPT_LIMIT_EXCEEDED` | 解答回数が上限を超過 |
| `DUPLICATE_ANSWER` | 同一問題に最終結果を送信済み |
| `QUESTION_NOT_ACTIVE` | 対象問題が回答受付中ではない |
| `QUESTION_MISMATCH` | 保存済みセッションと現在問題が一致しない |
| `PARTICIPANT_NOT_FOUND` | 参加者が存在しない |
| `ROOM_NOT_FOUND` | ルームが存在しない |
| `VALIDATION_HASH_MISSING` | ローカル判定用ハッシュが存在しない |

---

# 9. DB設計

## 9.1 `questions` テーブル

### 追加カラム

```sql
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 1;
```

### 既存または想定カラム

正解文字列は、既存の正解保存カラムを使用する。

DBには正解文字列を保持してよい。  
ただし、参加者向けAPIでは正解文字列を返さない。

---

## 9.2 `submissions` テーブル

### 追加カラム

```sql
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS final_status text;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 1;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS max_attempts_snapshot integer;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS final_answer text;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS client_started_at timestamptz;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS client_completed_at timestamptz;
```

### 既存追加済み想定

```sql
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS time_limit_ms integer DEFAULT 30000;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS answer_elapsed_ms integer;

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS server_received_at timestamptz DEFAULT now();
```

---

## 9.3 ハッシュをDBに保存するかどうか

### 推奨

初期実装では、DBには従来どおり正解文字列を保存し、問題取得APIのレスポンス生成時にハッシュ化する。

理由:

- 既存管理画面への影響が小さい
- 正規化ルール変更に対応しやすい
- 実装が簡単

### 将来的な選択肢

必要であれば、`questions.correct_answer_hashes` のようなカラムを追加して、保存時点でハッシュ化しておくこともできる。

ただし、本フェーズでは必須ではない。

---

## 9.4 重複防止index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_room_participant_question_final_completed
ON public.submissions (room_id, participant_id, question_id)
WHERE final_status IS NOT NULL;
```

既存データの都合で条件なしunique indexを適用できる場合は、以下でもよい。

```sql
CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique_room_participant_question_final
ON public.submissions (room_id, participant_id, question_id);
```

---

# 10. 管理画面要件

## FR-026: 問題作成画面で解答可能回数を設定できる

### 要件

管理画面の問題作成フォームに `maxAttempts` を追加する。

### 表示例

```txt
制限時間: [30] 秒
解答可能回数: [3] 回
```

---

## FR-027: 問題編集・表示画面で解答可能回数を確認できる

### 要件

管理画面で、各問題の解答可能回数を確認できるようにする。

### 表示例

```txt
制限時間: 30秒
解答可能回数: 3回
```

---

## FR-028: 管理画面では正解文字列を扱ってよい

### 要件

管理者向け画面では、問題作成・編集のために正解文字列を入力・表示してよい。

ただし、参加者向けAPIには正解文字列を返さない。

---

# 11. クライアント状態遷移

## 11.1 状態一覧

| 状態 | 意味 |
|---|---|
| `loading` | 問題取得中 |
| `ready` | 問題取得済み・開始前 |
| `active` | 問題表示中・タイマー進行中 |
| `completed` | 正解・タイムアウト・上限到達で終了 |
| `submitting` | 最終結果送信中 |
| `submitted` | 最終結果送信済み |
| `error` | エラー |

---

## 11.2 状態遷移

```txt
loading
  ↓
ready
  ↓ 開始ボタン押下
active
  ├─ 正解 → completed → submitting → submitted
  ├─ タイムアップ → completed → submitting → submitted
  └─ 解答回数上限到達 → completed → submitting → submitted
```

---

# 12. セキュリティ上の扱い

## 12.1 本方式で防げること

本方式では、以下を防ぐ。

- APIレスポンスに `"correctAnswer": "正解"` のように表示されること
- F12 の Network タブで正解文字列がそのまま見えること
- React state に正解文字列がそのまま入ること
- sessionStorage に正解文字列がそのまま保存されること

---

## 12.2 本方式で防げないこと

本方式では、以下は防げない。

- 短い答えの候補照合
- `A`, `B`, `C`, `D` のような少数候補の推測
- 開発者ツールを使ったJavaScript解析
- クライアント側ロジックの改変
- API直接送信
- 完全なチート行為

---

## 12.3 要件上の割り切り

本実装におけるハッシュ化は、正解文字列の直接露出防止を目的とする。

SHA-256ハッシュを用いることで、APIレスポンスやブラウザ開発者ツール上に正解文字列がそのまま表示されることを避ける。

ただし、クライアント側でローカル判定を行う以上、ハッシュ値と判定ロジックは参加者のブラウザに配布される。  
そのため、短い答えや候補数の少ない答えは候補照合により推測される可能性がある。

本フェーズでは、完全なチート対策ではなく、通信公平性・UX・正解文字列の直接露出防止を優先する。

---

# 13. 受け入れ条件

## AC-001: 問題取得後すぐには問題文が表示されない

### 条件

参加者がプレイ画面を開き、問題取得APIが成功する。

### 期待結果

問題文・問題画像・回答欄は表示されず、開始ボタンが表示される。

---

## AC-002: 開始ボタンを押すと問題表示とタイマー開始が同時に行われる

### 条件

開始ボタンを押す。

### 期待結果

問題文・問題画像・回答欄が表示され、残り時間が減り始める。

---

## AC-003: 問題画像読み込み前は開始できない

### 条件

問題画像がある問題を取得する。

### 期待結果

画像読み込み完了まで開始ボタンを無効化する、または読み込み中表示にする。

---

## AC-004: 問題取得APIに正解文字列が含まれない

### 条件

参加者画面で問題取得APIを実行する。

### 期待結果

レスポンスに以下が含まれない。

- `correctAnswer`
- `correctAnswers`
- `answer`
- `answers`
- `solution`
- 正解文字列そのもの

---

## AC-005: 問題取得APIに正解ハッシュが含まれる

### 条件

ローカル判定対象の問題を取得する。

### 期待結果

レスポンスに `validation.correctAnswerHashes` が含まれる。

---

## AC-006: F12のNetworkタブで正解文字列が直接見えない

### 条件

ブラウザの開発者ツールで `/api/current-question` のレスポンスを確認する。

### 期待結果

正解文字列は表示されず、ハッシュ値のみ表示される。

---

## AC-007: 正しい回答でローカル正解判定できる

### 条件

正解文字列を入力する。

### 期待結果

クライアント側でハッシュ比較により正解と判定される。

---

## AC-008: 不正解でローカル不正解判定できる

### 条件

不正解の文字列を入力する。

### 期待結果

クライアント側で不正解と判定され、残り解答回数が減る。

---

## AC-009: 複数回回答できる

### 条件

`maxAttempts = 3` の問題で、1回目を不正解にする。

### 期待結果

API通信は行われず、残り回数が表示され、再回答できる。

---

## AC-010: 最初に正解したタイミングで最終結果が送信される

### 条件

`maxAttempts = 3` の問題で、2回目に正解する。

### 期待結果

2回目の正解時点で最終結果が確定し、APIへ1回だけ送信される。

---

## AC-011: 正解後は追加回答できない

### 条件

正解後に回答欄または送信ボタンを操作する。

### 期待結果

追加回答できない。

---

## AC-012: タイムアップ時に最終結果が送信される

### 条件

正解しないまま制限時間を迎える。

### 期待結果

`finalStatus = "timeout"` として最終結果がAPIへ送信される。

---

## AC-013: 解答回数上限到達時に回答入力が無効化される

### 条件

`maxAttempts = 3` の問題で、3回すべて不正解にする。

### 期待結果

回答入力が無効化され、`attempt_limit_exceeded` として最終結果が確定する。

---

## AC-014: 最終結果送信は1回だけ行われる

### 条件

正解ボタン連打、タイムアップと送信処理の競合、ページ更新を試す。

### 期待結果

`submissions` には同一参加者・同一問題の結果が1件だけ保存される。

---

## AC-015: 開始前に更新しても開始前状態に戻る

### 条件

問題取得後、開始ボタンを押す前にページ更新する。

### 期待結果

更新後も開始前画面が表示され、タイマーは開始していない。

---

## AC-016: 開始後に更新しても残り時間が維持される

### 条件

開始ボタンを押し、10秒経過後にページ更新する。

### 期待結果

更新後、10秒経過した状態からタイマーが再開される。

---

## AC-017: 更新中に制限時間を超えた場合はタイムアウトになる

### 条件

開始後、ページ更新または離脱中に制限時間を超過する。

### 期待結果

再表示時に `timeout` として最終結果が確定する。

---

## AC-018: サーバー側でも最終正誤を再判定する

### 条件

`isCorrect = true` だが `finalAnswer` が不正解のリクエストを送る。

### 期待結果

サーバー側判定により不正解として保存される、または拒否される。

---

## AC-019: 既存MVPの基本動作を壊さない

### 条件

ルーム作成、参加、問題作成、問題表示、回答、結果表示を行う。

### 期待結果

既存の主要機能が維持される。

---

# 14. テスト項目

## 14.1 手動テスト

| No | 操作 | 期待結果 |
|---:|---|---|
| 1 | 問題取得 | 開始ボタンだけが表示される |
| 2 | F12でcurrent-questionレスポンス確認 | 正解文字列がなく、ハッシュのみある |
| 3 | 開始ボタン押下 | 問題表示とタイマー開始 |
| 4 | 画像付き問題を開始 | 画像が表示された状態でタイマー開始 |
| 5 | 不正解を送信 | API通信せず、残り回数が減る |
| 6 | 2回目で正解 | 正解時点の時間でAPI送信 |
| 7 | タイムアップ | timeout結果がAPI送信 |
| 8 | 解答上限到達 | attempt_limit_exceeded結果がAPI送信 |
| 9 | 開始前に更新 | 開始前状態に戻る |
| 10 | 開始後に更新 | 残り時間が維持される |
| 11 | 正解後に更新 | 結果画面に戻る |
| 12 | API直接送信で不正解を正解扱いにする | サーバー側再判定で防がれる |

---

## 14.2 DB確認

```sql
SELECT
  room_id,
  participant_id,
  question_id,
  final_status,
  is_correct,
  final_answer,
  answer_elapsed_ms,
  attempt_count,
  max_attempts_snapshot,
  server_received_at
FROM public.submissions
ORDER BY server_received_at DESC
LIMIT 20;
```

---

## 14.3 API確認

### `/api/current-question`

確認すること。

```txt
- 正解文字列が含まれていない
- validation.correctAnswerHashes が含まれている
- timeLimitMs が含まれている
- maxAttempts が含まれている
```

### `/api/submit-answer`

確認すること。

```txt
- finalStatus を受け取る
- finalAnswer を受け取る
- attemptCount を受け取る
- answerElapsedMs を受け取る
- サーバー側で finalAnswer を再判定する
- 重複送信を拒否する
```

---

# 15. 実装タスク

## Task 1: DBスキーマ更新

- `questions.max_attempts` を追加
- `submissions.final_status` を追加
- `submissions.attempt_count` を追加
- `submissions.max_attempts_snapshot` を追加
- `submissions.final_answer` を追加
- 必要に応じて `client_started_at`, `client_completed_at` を追加
- 重複送信用のunique indexを確認・追加

---

## Task 2: 共通の正規化・ハッシュ関数を実装

- サーバー側で使用する `normalizeAnswer`
- サーバー側で使用する `sha256`
- クライアント側で使用する `normalizeAnswer`
- クライアント側で使用する `sha256`
- サーバーとクライアントで正規化ルールを一致させる

---

## Task 3: 問題取得API更新

- `maxAttempts` を返す
- `validation.correctAnswerHashes` を返す
- `validation.correctAnswers` や正解文字列を返さない
- `serverNowMs` を返す
- 既存の `timeLimitMs` を維持する

---

## Task 4: 管理画面更新

- 問題作成フォームに解答可能回数を追加
- 問題表示画面に解答可能回数を表示
- 入力値のバリデーションを追加
- 管理画面では正解文字列を従来通り扱えるようにする

---

## Task 5: クライアントの開始前画面追加

- 問題取得後、問題を表示せず `ready` 状態にする
- 開始ボタンを表示する
- 問題画像をプリロードする
- 画像準備完了後に開始可能にする

---

## Task 6: ローカルプレイセッション実装

- `ready`, `active`, `completed`, `submitting`, `submitted` の状態管理
- `sessionStorage` への保存
- 開始前復元
- 開始後復元
- 完了状態復元

---

## Task 7: ローカル正誤判定実装

- 正解ハッシュによる判定を行う
- 複数回回答に対応する
- 正解時に即時finalizeする
- 不正解時に残り回数を表示する
- 正解文字列をクライアントに保存しない

---

## Task 8: 最終結果送信API更新

以下を受け取る。

- `finalStatus`
- `finalAnswer`
- `attemptCount`
- `maxAttempts`
- `answerElapsedMs`
- `isCorrect`

サーバー側で再検証して `submissions` に保存する。

---

## Task 9: ランキング・結果表示更新

- `final_status = 'correct'` を正答者として扱う
- `answer_elapsed_ms` 昇順で並べる
- `timeout` と `attempt_limit_exceeded` を不正解終了として表示する

---

## Task 10: テスト・確認

- TypeScriptチェック
- build
- 手動ブラウザ確認
- F12 Networkタブで正解文字列が出ていないことの確認
- DB保存内容確認
- 重複送信確認
- 更新時の状態復元確認

---

# 16. 実装上の注意

## 16.1 正解文字列を参加者向けAPIに返さない

参加者向けAPIでは、以下を返さない。

```txt
correctAnswer
correctAnswers
answer
answers
solution
expectedAnswer
```

既存コードでこれらを返している場合は、`correctAnswerHashes` に置き換える。

---

## 16.2 ハッシュ化は直接露出防止であり完全な不正対策ではない

本フェーズでは、ハッシュ化により「F12で正解文字列がそのまま見える」状態を防ぐ。

ただし、ハッシュ値と判定ロジックはクライアントに配布されるため、候補照合やJavaScript改変は防げない。

---

## 16.3 最終的な正誤はサーバー側判定を優先する

クライアントから送信された `isCorrect` は信用しすぎない。  
サーバー側で `finalAnswer` をDB上の正解と照合し、最終的な `is_correct` を決める。

---

## 16.4 `performance.now()` と `Date.now()` の使い分け

通常の経過時間計測には `performance.now()` を使う。  
ページ更新後の復元には `startedAtWallMs` や `deadlineAtWallMs` を使う。

`Date.now()` は復元用途に限定する。

---

## 16.5 最終結果送信失敗時は再送する

最終結果が確定したあとAPI送信に失敗した場合、`sessionStorage` に未送信状態を残し、ページ更新後または一定時間後に再送する。

---

# 17. 完了条件

この修正は、以下を満たした時点で完了とする。

- 問題取得後すぐには問題文・問題画像が表示されない
- 開始ボタン押下時に問題表示とタイマー開始が同時に行われる
- 問題画像が事前読み込みされる
- 解答可能回数を問題ごとに設定できる
- 問題取得APIに正解文字列が含まれない
- 問題取得APIに `correctAnswerHashes` が含まれる
- F12 Networkタブで正解文字列が直接見えない
- 複数回回答をローカルで処理できる
- 回答ごとにAPI通信しない
- 最初に正解した時点で最終結果がAPI送信される
- タイムアップ時に失敗結果がAPI送信される
- 解答回数上限到達時に失敗結果がAPI送信される
- 開始前のページ更新で開始前状態に戻る
- 開始後のページ更新で残り時間が維持される
- 最終結果は `submissions` に1件だけ保存される
- サーバー側でも `finalAnswer` を再判定する
- 既存MVPの基本動作を壊していない

---

# 18. Codexへの作業指示サマリー

以下の方針で実装すること。

```txt
このブランチでは、ローカル開始・複数回解答・正解ハッシュ化を実装する。

問題取得後、問題文・問題画像をすぐ表示せず、開始ボタンを表示する。
問題画像がある場合は、開始前にプリロードする。
開始ボタン押下時に、問題表示とタイマー開始を同時に行う。

問題ごとに maxAttempts を設定できるようにする。
開始後は maxAttempts 回までローカルで回答できる。
回答ごとにAPI通信しない。
正解、タイムアップ、または解答回数上限到達で最終結果を確定し、APIへ1回だけ送信する。

ローカル判定では、正解文字列をクライアントへ直接返さない。
問題取得APIでは、DB上の正解文字列をサーバー側で正規化し、SHA-256でハッシュ化した correctAnswerHashes のみを返す。
クライアント側では、ユーザー入力を同じ正規化ルールで正規化し、SHA-256でハッシュ化して correctAnswerHashes と比較する。

F12のNetworkタブで /api/current-question のレスポンスを見ても、正解文字列が直接表示されない状態にする。

ただし、このハッシュ化は完全な不正対策ではなく、正解文字列の直接露出防止を目的とする。
短い答えや候補数の少ない答えが候補照合されるリスクは許容する。

最終結果送信APIでは、クライアントから送られた isCorrect を信用しすぎず、finalAnswer をサーバー側でも再判定する。

ページ更新に対しては sessionStorage を使って状態を復元する。
開始前なら開始前画面に戻す。
開始後なら startedAtWallMs / deadlineAtWallMs を使って残り時間を復元する。
完了後かつ未送信なら最終結果送信を再試行する。

既存のルーム作成、参加、問題作成、問題表示、結果表示、ランキング表示を壊さないこと。
回答保存先は answers ではなく、既存命名に合わせて submissions を使うこと。
```
