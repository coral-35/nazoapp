"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatElapsedTime } from "@/lib/answer";
import { participantStorageKey } from "@/lib/participant-storage";

type PlayState = {
  room: {
    roomCode: string;
    title: string;
    status: string;
  };
  participant: {
    name: string;
    totalScore: number;
  };
  question: null | {
    id: string;
    title: string;
    imageUrl: string | null;
    points: number;
    orderIndex: number;
    timeLimitMs: number;
    status: "open" | "closed";
  };
  hasCorrectSubmission: boolean;
  hasSubmission: boolean;
};

type SavedParticipant = {
  participantToken: string;
  participantName: string;
  roomCode: string;
};

export default function PlayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = useMemo(() => String(params.roomCode || "").toUpperCase(), [params.roomCode]);
  const [saved, setSaved] = useState<SavedParticipant | null>(null);
  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"notice" | "success" | "error">("notice");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionVisibleAt, setQuestionVisibleAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const visibleQuestionIdRef = useRef<string | null>(null);
  const questionVisibleAtRef = useRef<number | null>(null);
  const submitLockedRef = useRef(false);

  const syncPlayState = useCallback((nextState: PlayState) => {
    const activeQuestionId =
      nextState.room.status === "question_open" ? nextState.question?.id || null : null;

    if (activeQuestionId) {
      if (visibleQuestionIdRef.current !== activeQuestionId) {
        const visibleAt = performance.now();
        visibleQuestionIdRef.current = activeQuestionId;
        questionVisibleAtRef.current = visibleAt;
        submitLockedRef.current = nextState.hasSubmission;
        setQuestionVisibleAt(visibleAt);
        setRemainingMs(nextState.question?.timeLimitMs ?? null);
        setHasSubmitted(nextState.hasSubmission);
        setAnswer("");
      } else {
        if (nextState.hasSubmission) {
          submitLockedRef.current = true;
        }
        setHasSubmitted(nextState.hasSubmission);
      }
    } else {
      visibleQuestionIdRef.current = null;
      questionVisibleAtRef.current = null;
      submitLockedRef.current = false;
      setQuestionVisibleAt(null);
      setRemainingMs(null);
      setHasSubmitted(false);
    }

    setPlayState(nextState);
  }, []);

  const loadState = useCallback(
    async (participantToken: string) => {
      const response = await fetch(
        `/api/current-question?room_code=${encodeURIComponent(
          roomCode
        )}&participant_token=${encodeURIComponent(participantToken)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "状態を取得できませんでした。");
      }
      syncPlayState(data);
    },
    [roomCode, syncPlayState]
  );

  useEffect(() => {
    if (
      !playState?.question ||
      playState.room.status !== "question_open" ||
      questionVisibleAt === null
    ) {
      return;
    }

    const updateRemaining = () => {
      const elapsedMs = performance.now() - questionVisibleAt;
      const nextRemainingMs = Math.max(0, playState.question!.timeLimitMs - elapsedMs);
      setRemainingMs(nextRemainingMs);
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 100);
    return () => window.clearInterval(intervalId);
  }, [
    playState?.question?.id,
    playState?.question?.timeLimitMs,
    playState?.room.status,
    questionVisibleAt
  ]);

  useEffect(() => {
    const raw = localStorage.getItem(participantStorageKey(roomCode));
    if (!raw) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(raw) as SavedParticipant;
    setSaved(parsed);

    let active = true;
    async function tick() {
      try {
        await loadState(parsed.participantToken);
        if (active) {
          setMessage("");
        }
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

    tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadState, roomCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved || !playState?.question) {
      return;
    }

    if (
      submitLockedRef.current ||
      submitting ||
      hasSubmitted ||
      playState.hasSubmission ||
      playState.hasCorrectSubmission
    ) {
      return;
    }

    if (!answer.trim()) {
      setMessage("解答を入力してください。");
      setMessageType("error");
      return;
    }

    const visibleAt = questionVisibleAtRef.current;
    if (visibleAt === null) {
      setMessage("回答時間を計測できませんでした。問題を再読み込みしてください。");
      setMessageType("error");
      return;
    }

    const answerElapsedMs = Math.round(performance.now() - visibleAt);
    if (!Number.isFinite(answerElapsedMs) || !Number.isInteger(answerElapsedMs) || answerElapsedMs < 0) {
      setMessage("回答時間が正しくありません。問題を再読み込みしてください。");
      setMessageType("error");
      return;
    }

    if (answerElapsedMs > playState.question.timeLimitMs) {
      setRemainingMs(0);
      setMessage("制限時間を超過しました。");
      setMessageType("notice");
      return;
    }

    submitLockedRef.current = true;
    setSubmitting(true);
    setHasSubmitted(true);
    setMessage("");
    try {
      const response = await fetch("/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          participantToken: saved.participantToken,
          questionId: playState.question.id,
          answer,
          answerElapsedMs
        })
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.error === "DUPLICATE_ANSWER") {
          setMessage(data.message || "この問題には回答済みです。");
          setMessageType("notice");
          setHasSubmitted(true);
          try {
            await loadState(saved.participantToken);
          } catch {
            // The duplicate answer was already rejected; polling will catch up later.
          }
          return;
        }

        if (data.error === "QUESTION_NOT_ACTIVE" || data.result === "closed") {
          setMessage(data.message || "この問題は受付終了、または現在の問題ではありません。");
          setMessageType("notice");
          try {
            await loadState(saved.participantToken);
          } catch {
            // Keep the user-facing closed message if the follow-up refresh fails.
          }
          return;
        }

        setHasSubmitted(false);
        submitLockedRef.current = false;
        throw new Error(data.message || data.error || "解答送信に失敗しました。");
      }

      const elapsedLabel =
        typeof data.answerElapsedMs === "number" ? ` 回答時間: ${formatElapsedTime(data.answerElapsedMs)}` : "";
      setMessage(`${data.message || "送信しました。"}${elapsedLabel}`);
      setMessageType(data.isCorrect ? "success" : data.result === "closed" ? "notice" : "error");
      setAnswer("");
      try {
        await loadState(saved.participantToken);
      } catch {
        // The answer was submitted; the regular polling loop will refresh the score.
      }
    } catch (caught) {
      setHasSubmitted(false);
      submitLockedRef.current = false;
      setMessage(caught instanceof Error ? caught.message : "解答送信に失敗しました。");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  const isTimedOut = Boolean(playState?.question) && remainingMs !== null && remainingMs <= 0;
  const hasAnySubmission =
    hasSubmitted || Boolean(playState?.hasSubmission) || Boolean(playState?.hasCorrectSubmission);
  const canAnswer =
    Boolean(playState?.question) &&
    playState?.room.status === "question_open" &&
    questionVisibleAt !== null &&
    !hasAnySubmission &&
    !isTimedOut;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          謎解き企画アプリ
        </Link>
        <Link className="link-button" href="/join">
          参加し直す
        </Link>
      </header>

      <section className="narrow-page stack">
        {loading ? <div className="panel">読み込み中...</div> : null}

        {!loading && !saved ? (
          <div className="panel stack">
            <h1>参加情報がありません</h1>
            <p className="muted">ページ更新後の復帰には、先にルーム参加が必要です。</p>
            <Link className="button" href="/join">
              参加画面へ
            </Link>
          </div>
        ) : null}

        {playState ? (
          <>
            <div className="score">
              <div>
                <div>{playState.participant.name}</div>
                <div className="muted">Room {playState.room.roomCode}</div>
              </div>
              <div>
                <span>得点 </span>
                <strong>{playState.participant.totalScore}</strong>
              </div>
            </div>

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
                    <div className="muted">第{playState.question.orderIndex}問</div>
                    <h1>{playState.question.title}</h1>
                  </div>
                  {playState.room.status === "question_open" ? (
                    <div className={`timer-row ${isTimedOut ? "timeout" : ""}`}>
                      <span>残り時間</span>
                      <strong>
                        {formatElapsedTime(
                          Math.max(0, Math.round(remainingMs ?? playState.question.timeLimitMs))
                        )}
                      </strong>
                    </div>
                  ) : null}
                  <div className="question-image-wrap">
                    {playState.question.imageUrl ? (
                      <img
                        className="question-image"
                        src={playState.question.imageUrl}
                        alt={`${playState.question.title}の問題画像`}
                      />
                    ) : (
                      <div className="muted">問題画像が登録されていません。</div>
                    )}
                  </div>

                  {playState.hasCorrectSubmission ? (
                    <div className="message success">この問題は正解済みです。</div>
                  ) : null}

                  {!playState.hasCorrectSubmission && hasAnySubmission ? (
                    <div className="message notice">この問題は回答済みです。</div>
                  ) : null}

                  {isTimedOut && !hasAnySubmission ? (
                    <div className="message notice">タイムアップです。</div>
                  ) : null}

                  {playState.room.status === "question_closed" ? (
                    <div className="message notice">この問題は締め切られました。</div>
                  ) : null}

                  <form className="form" onSubmit={handleSubmit}>
                    <label className="field">
                      <span>解答</span>
                      <input
                        className="input"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        disabled={!canAnswer || submitting}
                        autoComplete="off"
                      />
                    </label>
                    <button className="button" type="submit" disabled={!canAnswer || submitting}>
                      {submitting ? "送信中..." : "解答を送信"}
                    </button>
                  </form>
                </>
              )}

              {message ? <div className={`message ${messageType}`}>{message}</div> : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
