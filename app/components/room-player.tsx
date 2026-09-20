"use client";

import { EventResults } from "@/app/components/event-results";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHOICE_KEYS, type Results } from "@/lib/results";
import { normalizeAnswer, sha256Hex } from "@/lib/answer";
import {
  finalStatusMessage,
  formatAttemptLog,
  type ParticipantFinalStatus
} from "@/lib/participant-answer-feedback";
import { participantStorageKey, readStoredParticipant } from "@/lib/participant-storage";
import { MAX_ANSWER_LENGTH } from "@/lib/input-limits";
import { formatQuestionPlacement } from "@/lib/question-placement";

type FinalStatus = ParticipantFinalStatus;
type SessionStatus = "ready" | "active" | "completed" | "submitting" | "submitted";

type LocalAttempt = {
  answer: string;
  elapsedMs: number;
  isCorrect: boolean;
  beforeReveal: boolean;
};

type LocalQuestionSession = {
  status: SessionStatus;
  roomCode: string;
  participantId: string;
  questionId: string;
  timeLimitMs: number;
  maxAttempts: number;
  attemptCount: number;
  attempts: LocalAttempt[];
  startedAtWallMs?: number;
  deadlineAtWallMs?: number;
  completedAtWallMs?: number;
  answerElapsedMs?: number;
  finalStatus?: FinalStatus;
  finalAnswer?: string | null;
  imageRevealed: boolean;
  answeredBeforeReveal: boolean;
  resultSubmitted: boolean;
};

type PlayState = {
  room: {
    showResults: boolean;
    roomCode: string;
    title: string;
    status: string;
  };
  participant: {
    id: string;
    name: string;
    results: Results;
  };
  question: null | {
    id: string;
    title: string;
    imageUrl: string | null;
    mode: "normal" | "multiple_choice";
    setNumber: number;
    questionLabel: string;
    orderIndex: number;
    timeLimitMs: number;
    maxAttempts: number;
    validation: {
      mode: "local_hash";
      type: "exact";
      correctAnswerHashes: string[];
      caseSensitive: false;
      trimWhitespace: true;
      normalizeWidth: true;
      normalizeKana: false;
    };
    status: "open" | "closed";
  };
  hasCorrectSubmission: boolean;
  hasSubmission: boolean;
  serverNowMs: number;
};

type SavedParticipant = {
  participantToken: string;
  participantName: string;
  roomCode: string;
};

function questionSessionKey(roomCode: string, participantId: string, questionId: string) {
  return `nazoapp:question-session:${roomCode}:${participantId}:${questionId}`;
}

function readQuestionSession(key: string): LocalQuestionSession | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LocalQuestionSession;
    if (
      !parsed ||
      !["ready", "active", "completed", "submitting", "submitted"].includes(parsed.status) ||
      !Number.isInteger(parsed.attemptCount) ||
      !Array.isArray(parsed.attempts)
    ) {
      return null;
    }
    return {
      ...parsed,
      imageRevealed: parsed.imageRevealed ?? Boolean(parsed.startedAtWallMs),
      answeredBeforeReveal: parsed.answeredBeforeReveal ?? false
    };
  } catch {
    return null;
  }
}

export function RoomPlayer({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedParticipant | null>(null);
  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [session, setSession] = useState<LocalQuestionSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"notice" | "success" | "error">("notice");
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [imageStatus, setImageStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [judging, setJudging] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const sessionRef = useRef<LocalQuestionSession | null>(null);
  const initializedSessionKeyRef = useRef<string | null>(null);
  const startedAtPerfRef = useRef<number | null>(null);
  const submitLockedRef = useRef(false);
  const attemptLockedRef = useRef(false);
  const retryAfterRef = useRef(0);

  const commitSession = useCallback((nextSession: LocalQuestionSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (nextSession) {
      const key = questionSessionKey(
        nextSession.roomCode,
        nextSession.participantId,
        nextSession.questionId
      );
      sessionStorage.setItem(key, JSON.stringify(nextSession));
    }
  }, []);

  const loadState = useCallback(
    async (participantToken: string) => {
      const response = await fetch(
        `/api/current-question?room_code=${encodeURIComponent(
          roomCode
        )}&participant_token=${encodeURIComponent(participantToken)}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as PlayState & { error?: string };
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem(participantStorageKey(roomCode));
          setSaved(null);
          router.replace("/join");
        }
        throw new Error(data.error || "状態を取得できませんでした。");
      }

      setPlayState((current) => {
        const currentQuestion = current?.question;
        const nextQuestion = data.question;
        if (currentQuestion && nextQuestion && currentQuestion.id === nextQuestion.id) {
          return { ...data, question: currentQuestion };
        }
        return data;
      });
    },
    [roomCode, router]
  );

  const finalizeResult = useCallback(
    (
      finalStatus: FinalStatus,
      answerElapsedMs: number,
      finalAnswer: string | null,
      answeredBeforeReveal = false
    ) => {
      const current = sessionRef.current;
      if (!current || (current.status !== "ready" && current.status !== "active")) {
        return;
      }

      const completed: LocalQuestionSession = {
        ...current,
        status: "completed",
        answerElapsedMs,
        finalStatus,
        finalAnswer,
        answeredBeforeReveal,
        completedAtWallMs: Date.now(),
        resultSubmitted: false
      };
      commitSession(completed);
      setRemainingMs(Math.max(0, current.timeLimitMs - answerElapsedMs));
      setMessage(finalStatusMessage(finalStatus));
      setMessageType(
        finalStatus === "correct" ? "success" : finalStatus === "timeout" ? "notice" : "error"
      );
    },
    [commitSession]
  );

  useEffect(() => {
    const parsed = readStoredParticipant(localStorage, roomCode);
    if (!parsed) {
      setLoading(false);
      router.replace("/join");
      return;
    }
    setSaved(parsed);
    const participantToken = parsed.participantToken;

    let active = true;
    async function tick() {
      try {
        await loadState(participantToken);
      } catch (caught) {
        if (active) {
          setMessage(caught instanceof Error ? caught.message : "状態を取得できませんでした。");
          setMessageType("error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadState, roomCode, router]);

  useEffect(() => {
    const question = playState?.question;
    const participant = playState?.participant;
    if (!question || !participant) {
      initializedSessionKeyRef.current = null;
      sessionRef.current = null;
      setSession(null);
      setRemainingMs(null);
      return;
    }

    const key = questionSessionKey(roomCode, participant.id, question.id);
    if (initializedSessionKeyRef.current === key) {
      return;
    }
    initializedSessionKeyRef.current = key;
    submitLockedRef.current = false;
    retryAfterRef.current = 0;

    const stored = readQuestionSession(key);
    const matchesCurrentQuestion =
      stored?.roomCode === roomCode &&
      stored.participantId === participant.id &&
      stored.questionId === question.id;
    let restored = matchesCurrentQuestion ? stored : null;

    if (!restored) {
      restored = {
        status: "ready",
        roomCode,
        participantId: participant.id,
        questionId: question.id,
        timeLimitMs: question.timeLimitMs,
        maxAttempts: question.maxAttempts,
        attemptCount: 0,
        attempts: [],
        imageRevealed: false,
        answeredBeforeReveal: false,
        resultSubmitted: false
      };
    } else if (restored.status === "submitting") {
      restored = { ...restored, status: "completed", resultSubmitted: false };
    }

    restored = {
      ...restored,
      imageRevealed: restored.imageRevealed ?? Boolean(restored.startedAtWallMs),
      answeredBeforeReveal: restored.answeredBeforeReveal ?? false
    };

    if (playState.hasSubmission) {
      restored = { ...restored, status: "submitted", resultSubmitted: true };
    } else if (restored.status === "active" && restored.startedAtWallMs && restored.deadlineAtWallMs) {
      const elapsedWallMs = Math.max(0, Date.now() - restored.startedAtWallMs);
      startedAtPerfRef.current = performance.now() - elapsedWallMs;
      if (Date.now() >= restored.deadlineAtWallMs) {
        restored = {
          ...restored,
          status: "completed",
          finalStatus: "timeout",
          finalAnswer: restored.attempts.at(-1)?.answer || null,
          answerElapsedMs: restored.timeLimitMs,
          completedAtWallMs: Date.now(),
          resultSubmitted: false
        };
      }
    }

    const initialRemaining =
      restored.status === "active" && restored.deadlineAtWallMs
        ? Math.max(0, restored.deadlineAtWallMs - Date.now())
        : restored.answerElapsedMs !== undefined
          ? Math.max(0, restored.timeLimitMs - restored.answerElapsedMs)
          : restored.timeLimitMs;
    setRemainingMs(initialRemaining);
    commitSession(restored);
  }, [commitSession, playState, roomCode]);

  useEffect(() => {
    const question = playState?.question;
    if (!question) {
      setImageStatus("idle");
      return;
    }
    if (!question.imageUrl) {
      setImageStatus("ready");
      return;
    }

    let active = true;
    const image = new Image();
    setImageStatus("loading");
    image.onload = () => active && setImageStatus("ready");
    image.onerror = () => active && setImageStatus("error");
    image.src = question.imageUrl;
    return () => {
      active = false;
    };
  }, [playState?.question?.id, playState?.question?.imageUrl]);

  useEffect(() => {
    if (session?.status !== "active") {
      return;
    }

    const updateRemaining = () => {
      const current = sessionRef.current;
      const startedAtPerf = startedAtPerfRef.current;
      if (!current || current.status !== "active" || startedAtPerf === null) {
        return;
      }

      const elapsedMs = Math.max(0, performance.now() - startedAtPerf);
      const perfRemainingMs = current.timeLimitMs - elapsedMs;
      const wallRemainingMs = current.deadlineAtWallMs
        ? current.deadlineAtWallMs - Date.now()
        : perfRemainingMs;
      const nextRemainingMs = Math.max(0, Math.min(perfRemainingMs, wallRemainingMs));
      setRemainingMs(nextRemainingMs);

      if (nextRemainingMs <= 0) {
        finalizeResult("timeout", current.timeLimitMs, current.attempts.at(-1)?.answer || null);
      }
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 100);
    return () => window.clearInterval(intervalId);
  }, [finalizeResult, session?.questionId, session?.status]);

  const submitFinalResult = useCallback(async () => {
    const current = sessionRef.current;
    if (!saved || !current || current.status !== "completed" || submitLockedRef.current) {
      return;
    }

    submitLockedRef.current = true;
    commitSession({ ...current, status: "submitting" });
    try {
      const response = await fetch("/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          participantId: current.participantId,
          participantToken: saved.participantToken,
          questionId: current.questionId,
          finalStatus: current.finalStatus,
          isCorrect: current.finalStatus === "correct",
          finalAnswer: current.finalAnswer ?? null,
          answerElapsedMs: current.answerElapsedMs,
          attemptCount: current.attemptCount,
          maxAttempts: current.maxAttempts,
          answeredBeforeReveal: current.answeredBeforeReveal,
          clientStartedAt: current.startedAtWallMs
            ? new Date(current.startedAtWallMs).toISOString()
            : undefined,
          clientCompletedAt: current.completedAtWallMs
            ? new Date(current.completedAtWallMs).toISOString()
            : undefined
        })
      });
      const data = await response.json();
      if (!response.ok && data.error !== "DUPLICATE_ANSWER") {
        throw new Error(data.message || data.error || "解答結果を記録できませんでした。");
      }

      retryAfterRef.current = 0;
      commitSession({ ...current, status: "submitted", resultSubmitted: true });
      setMessage(
        data.error === "DUPLICATE_ANSWER"
          ? data.message || "この問題への解答は完了しています。"
          : data.message || finalStatusMessage(current.finalStatus)
      );
      setMessageType(
        current.finalStatus === "correct"
          ? "success"
          : current.finalStatus === "timeout"
            ? "notice"
            : "error"
      );
      try {
        await loadState(saved.participantToken);
      } catch {
        // The final result is persisted; regular polling will refresh the score.
      }
    } catch (caught) {
      retryAfterRef.current = Date.now() + 3000;
      commitSession({ ...current, status: "completed", resultSubmitted: false });
      setMessage(caught instanceof Error ? caught.message : "解答結果を記録できませんでした。");
      setMessageType("error");
    } finally {
      submitLockedRef.current = false;
    }
  }, [commitSession, loadState, roomCode, saved]);

  useEffect(() => {
    if (session?.status !== "completed") {
      return;
    }

    const delayMs = Math.max(0, retryAfterRef.current - Date.now());
    const timer = window.setTimeout(() => {
      void submitFinalResult().finally(() => setRetryVersion((value) => value + 1));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [retryVersion, session?.status, submitFinalResult]);

  function startQuestion() {
    const current = sessionRef.current;
    const question = playState?.question;
    if (
      !current ||
      !question ||
      current.status !== "ready" ||
      imageStatus !== "ready" ||
      playState?.room.status !== "question_open" ||
      playState.hasSubmission
    ) {
      return;
    }

    const startedAtWallMs = Date.now();
    startedAtPerfRef.current = performance.now();
    setRemainingMs(question.timeLimitMs);
    setMessage("");
    setAnswer("");
    commitSession({
      ...current,
      status: "active",
      timeLimitMs: question.timeLimitMs,
      maxAttempts: question.maxAttempts,
      imageRevealed: true,
      answeredBeforeReveal: false,
      startedAtWallMs,
      deadlineAtWallMs: startedAtWallMs + question.timeLimitMs,
      resultSubmitted: false
    });
  }

  async function handleAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = sessionRef.current;
    const question = playState?.question;
    const submittedAnswer = answer.trim();
    if (
      !current ||
      !question ||
      (current.status !== "ready" && current.status !== "active") ||
      playState.room.status !== "question_open" ||
      attemptLockedRef.current
    ) {
      return;
    }
    if (!submittedAnswer) {
      setMessage(question.mode === "multiple_choice" ? "A〜Dから解答を選択してください。" : "解答を入力してください。");
      setMessageType("error");
      return;
    }
    const isBeforeReveal = current.status === "ready";
    if (!isBeforeReveal && current.deadlineAtWallMs && Date.now() >= current.deadlineAtWallMs) {
      finalizeResult("timeout", current.timeLimitMs, current.attempts.at(-1)?.answer || null);
      return;
    }

    const startedAtPerf = startedAtPerfRef.current;
    if (!isBeforeReveal && startedAtPerf === null) {
      setMessage("回答時間を復元できませんでした。ページを再読み込みしてください。");
      setMessageType("error");
      return;
    }
    const elapsedMs = isBeforeReveal
      ? 0
      : Math.min(
          current.timeLimitMs,
          Math.max(0, Math.round(performance.now() - (startedAtPerf as number)))
        );

    attemptLockedRef.current = true;
    setJudging(true);
    try {
      const inputHash = await sha256Hex(normalizeAnswer(submittedAnswer));
      if (
        sessionRef.current?.status !== "ready" &&
        sessionRef.current?.status !== "active"
      ) {
        return;
      }
      const isCorrect = question.validation.correctAnswerHashes.includes(inputHash);
      const nextAttempt: LocalAttempt = {
        answer: submittedAnswer,
        elapsedMs,
        isCorrect,
        beforeReveal: isBeforeReveal
      };
      const nextAttemptCount = current.attemptCount + 1;
      const activeSession: LocalQuestionSession = {
        ...current,
        attemptCount: nextAttemptCount,
        attempts: [...current.attempts, nextAttempt]
      };
      commitSession(activeSession);
      setAnswer("");

      if (isCorrect) {
        finalizeResult("correct", elapsedMs, submittedAnswer, isBeforeReveal);
      } else if (nextAttemptCount >= current.maxAttempts) {
        finalizeResult("attempt_limit_exceeded", elapsedMs, submittedAnswer);
      } else {
        const remainingAttempts = current.maxAttempts - nextAttemptCount;
        setMessage(`不正解です。残り${remainingAttempts}回回答できます。`);
        setMessageType("error");
      }
    } catch {
      setMessage("ローカル正誤判定に失敗しました。安全な接続で再読み込みしてください。");
      setMessageType("error");
    } finally {
      attemptLockedRef.current = false;
      setJudging(false);
    }
  }

  const isReady = session?.status === "ready";
  const imageRevealed = Boolean(session?.imageRevealed);
  const canAnswer =
    (session?.status === "ready" || session?.status === "active") &&
    playState?.room.status === "question_open" &&
    !playState.hasSubmission &&
    !judging &&
    (session?.status === "ready" || (remainingMs ?? 0) > 0);
  const remainingAttempts = session ? Math.max(0, session.maxAttempts - session.attemptCount) : 0;


  if (playState?.room.showResults && saved) {
    return <EventResults roomId="default" participantToken={saved.participantToken} />;
  }

  return (
    <main className="app-shell">
      <section className="narrow-page stack">
        {loading ? <div className="panel">読み込み中...</div> : null}

        {!loading && !saved ? (
          <div className="panel stack">
            <h1>参加情報がありません</h1>
            <p className="muted">ページ更新後の復帰には、先にイベント参加が必要です。</p>
            <Link className="button" href="/join">
              参加画面へ
            </Link>
          </div>
        ) : null}

        {playState ? (
          <>
            <div className="panel stack">
              <div className="action-row">
                <span
                  className={`status ${
                    playState.room.status === "question_open"
                      ? "open"
                      : playState.room.status === "question_closed"
                        ? "closed"
                        : "waiting"
                  }`}
                >
                  {playState.room.status === "question_open"
                    ? "受付中"
                    : playState.room.status === "question_closed"
                      ? "締切済み"
                      : "待機中"}
                </span>
                <strong>{playState.room.title}</strong>
              </div>

              {!playState.question ? (
                <div className="message notice">出題者が問題を開始するまでお待ちください。</div>
              ) : (
                <>
                  <div>
                    <h1>{formatQuestionPlacement(playState.question.setNumber, playState.question.questionLabel)}</h1>
                  </div>
                  <div className="muted">
                    解答可能回数 {playState.question.maxAttempts}回 / 解答済み{" "}
                    {session?.attemptCount || 0}回 / 残り {remainingAttempts}回
                  </div>
                  <div className={`question-image-wrap ${imageRevealed ? "" : "preview"}`}>
                    {imageRevealed && playState.question.imageUrl ? (
                      <img
                        className="question-image"
                        src={playState.question.imageUrl}
                        alt={`${playState.question.title}の問題画像`}
                      />
                    ) : imageRevealed ? (
                      <div className="muted">この問題には画像がありません。</div>
                    ) : (
                      <div className="question-image-placeholder">
                        開始すると問題画像が表示されます
                      </div>
                    )}
                  </div>

                  <div className="reveal-control">
                    {isReady && playState.room.status === "question_open" && !playState.hasSubmission ? (
                      <button
                        className="button"
                        type="button"
                        onClick={startQuestion}
                        disabled={imageStatus !== "ready"}
                      >
                        {imageStatus === "ready" ? "画像を表示して開始" : "画像を準備中..."}
                      </button>
                    ) : null}
                  </div>

                  <form className="form" onSubmit={handleAttempt}>
                    <div className="field">
                      <span>解答</span>
                      {playState.question.mode === "multiple_choice" ? (
                        <div className="action-row" role="group" aria-label="4択の解答">
                          {CHOICE_KEYS.map(choice => <button key={choice} type="button" className={`button ${answer === choice ? "" : "secondary"}`} aria-pressed={answer === choice} disabled={!canAnswer} onClick={() => setAnswer(choice)}>{choice}</button>)}
                        </div>
                      ) : <input
                        aria-label="解答"
                        className="input"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        disabled={!canAnswer}
                        autoComplete="off"
                        maxLength={MAX_ANSWER_LENGTH}
                      />}
                    </div>
                    <button className="button" type="submit" disabled={!canAnswer}>
                      {judging ? "判定中..." : "解答する"}
                    </button>
                  </form>

                  <div className="answer-result-area" aria-live="polite">
                    {session?.finalStatus ? (
                      <div
                        className={`message ${
                          session.finalStatus === "correct"
                            ? "success"
                            : session.finalStatus === "timeout"
                              ? "notice"
                              : "error"
                        }`}
                      >
                        {finalStatusMessage(session.finalStatus)}
                        {session.answeredBeforeReveal ? " 画像表示前に正解しました。" : ""}
                      </div>
                    ) : playState.hasSubmission ? (
                      <div
                        className={`message ${
                          playState.hasCorrectSubmission ? "success" : "notice"
                        }`}
                      >
                        {playState.hasCorrectSubmission
                          ? "正解です。"
                          : "この問題への解答は終了しました。"}
                      </div>
                    ) : playState.room.status === "question_closed" ? (
                      <div className="message notice">この問題は締め切られました。</div>
                    ) : imageStatus === "error" && isReady ? (
                      <div className="message error">
                        問題画像の読み込みに失敗しました。再読み込みしてください。
                      </div>
                    ) : message ? (
                      <div className={`message ${messageType}`}>{message}</div>
                    ) : null}
                  </div>

                  {session?.attempts.length ? (
                    <div className="attempt-log">
                      <strong>解答ログ</strong>
                      <ol className="attempt-log-list" aria-label="解答ログ">
                        {session.attempts.map((attempt, index) => (
                          <li
                            className={`attempt-log-item ${
                              attempt.isCorrect ? "correct" : "incorrect"
                            }`}
                            key={`${index}-${attempt.elapsedMs}`}
                          >
                            {formatAttemptLog(attempt, index)}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
