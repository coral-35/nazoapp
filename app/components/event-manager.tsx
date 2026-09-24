"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResultsSummary } from "@/app/components/results-summary";
import { CHOICE_KEYS, type Results } from "@/lib/results";
import { adminFetch, getAdminAccessToken } from "@/lib/admin-client";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUESTION_TIME_LIMIT_MS,
  MAX_ALLOWED_ATTEMPTS,
  formatElapsedTime
} from "@/lib/answer";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MAX_ANSWER_LENGTH } from "@/lib/input-limits";
import { questionStatusPresentation, roomStatusPresentation } from "@/lib/status-labels";
import { alphabeticQuestionLabel, questionPlacementBySetCounts } from "@/lib/question-placement";

type RoomDetail = {
  room: {
    id: string;
    room_code: string;
    title: string;
    status: string;
    current_question_id: string | null;
    questions_per_set: number;
    set_question_counts: number[];
    show_results: boolean;
  };
  questions: Question[];
  participants: Participant[];
  submissions: Submission[];
};

type Question = {
  id: string;
  title: string;
  display_image_url: string | null;
  image_path: string | null;
  image_url: string | null;
  answer_text: string;
  answer_aliases: string[];
  mode: "normal" | "multiple_choice";
  time_limit_ms: number;
  max_attempts: number;
  order_index: number;
  is_adopted: boolean;
  is_practice: boolean;
  status: string;
};

type Participant = {
  id: string;
  name: string;
  results: Results;
  created_at: string;
};

type Submission = {
  id: string;
  participant_id: string;
  question_id: string;
  submitted_answer: string;
  is_correct: boolean;
  awarded_mode: "normal" | "multiple_choice";
  answer_elapsed_ms: number | null;
  final_status: "correct" | "timeout" | "attempt_limit_exceeded" | null;
  attempt_count: number;
  max_attempts_snapshot: number | null;
  final_answer: string | null;
  answered_before_reveal: boolean;
  server_received_at: string | null;
  created_at: string;
};

type UploadedImage = {
  imagePath: string;
  imageUrl: string | null;
};

type OrganizeDraftQuestion = Question & {
  draftAdopted: boolean;
};

function cleanAnswerTexts(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function splitAnswerText(value: string) {
  return value.split(/\r?\n/);
}

function parseSetQuestionCounts(value: string) {
  return value
    .split(/[,、\s]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 1000);
}

export function EventManager({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [answerTexts, setAnswerTexts] = useState([""]);
  const [mode, setMode] = useState<"normal" | "multiple_choice">("normal");
  const [questionsPerSet, setQuestionsPerSet] = useState(7);
  const [setQuestionCountsText, setSetQuestionCountsText] = useState("7");
  const [isPractice, setIsPractice] = useState(false);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(
    DEFAULT_QUESTION_TIME_LIMIT_MS / 1000
  );
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"normal" | "multiple_choice">("normal");
  const [editAnswerTexts, setEditAnswerTexts] = useState([""]);
  const [editTimeLimitSeconds, setEditTimeLimitSeconds] = useState(DEFAULT_QUESTION_TIME_LIMIT_MS / 1000);
  const [editMaxAttempts, setEditMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [editImage, setEditImage] = useState<UploadedImage | null>(null);
  const [editIsPractice, setEditIsPractice] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [organizeDraft, setOrganizeDraft] = useState<OrganizeDraftQuestion[]>([]);

  const loadDetail = useCallback(
    async (accessToken: string) => {
      const response = await adminFetch("/api/admin/event", accessToken, {
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "イベント情報を取得できませんでした。");
      }
      setDetail(data);
      setQuestionsPerSet(data.room.questions_per_set);
      setSetQuestionCountsText((data.room.set_question_counts || [data.room.questions_per_set]).join(","));
    },
    [roomId, router]
  );

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const accessToken = await getAdminAccessToken();
        if (!accessToken) {
          router.replace("/admin/login");
          return;
        }
        if (active) {
          setToken(accessToken);
        }
        await loadDetail(accessToken);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "イベント情報を読み込めませんでした。");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [loadDetail, router]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>, target: "new" | "edit" = "new") {
    const file = event.target.files?.[0];
    if (!file || !token) {
      return;
    }

    const formData = new FormData();
    formData.set("roomId", roomId);
    formData.set("file", file);
    setUploading(true);
    setError("");

    try {
      const response = await adminFetch("/api/admin/upload-question-image", token, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "画像アップロードに失敗しました。");
      }
      if (target === "edit") setEditImage(data);
      else setUploadedImage(data);
      setNotice("画像をアップロードしました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "画像アップロードに失敗しました。");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await adminFetch("/api/admin/create-question", token, {
        method: "POST",
        body: JSON.stringify({
          roomId,
          answerTexts: mode === "multiple_choice" ? [answerTexts[0] || "1"] : cleanAnswerTexts(answerTexts),
          mode,
          timeLimitMs: Math.max(1, Math.round(timeLimitSeconds)) * 1000,
          maxAttempts,
          imagePath: uploadedImage?.imagePath,
          imageUrl: uploadedImage?.imageUrl,
          isPractice
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "問題登録に失敗しました。");
      }
      setAnswerTexts(mode === "multiple_choice" ? ["1"] : [""]);

      setTimeLimitSeconds(DEFAULT_QUESTION_TIME_LIMIT_MS / 1000);
      setMaxAttempts(DEFAULT_MAX_ATTEMPTS);
      setUploadedImage(null);
      setIsPractice(false);
      setNotice("問題候補を登録しました。採用すると出題対象になります。");
      await loadDetail(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "問題登録に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function runProgressAction(path: string, body: object, confirmText: string) {
    if (!token || !window.confirm(confirmText)) {
      return;
    }

    setError("");
    setNotice("");
    const response = await adminFetch(path, token, {
      method: "POST",
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "操作に失敗しました。");
      return;
    }
    setNotice("進行状態を更新しました。");
    await loadDetail(token);
  }

  async function switchResults(showResults: boolean) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/event", token, { method: "PATCH", body: JSON.stringify({ showResults }) });
      if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "表示を切り替えられませんでした。");
      await loadDetail(token);
      setNotice(showResults ? "参加者画面を結果発表に切り替えました。" : "参加者画面を通常表示に戻しました。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "表示切り替えに失敗しました。"); }
    finally { setSaving(false); }
  }

  async function saveSetSize() {
    if (!token) return;
    const setQuestionCounts = parseSetQuestionCounts(setQuestionCountsText);
    if (!setQuestionCounts.length) {
      setError("セットごとの問題数を1〜1000の整数で入力してください。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/event", token, { method: "PATCH", body: JSON.stringify({ setQuestionCounts }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "セット設定を保存できませんでした。");
      await loadDetail(token);
      setNotice("セット設定を保存しました。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存に失敗しました。"); }
    finally { setSaving(false); }
  }

  async function organizeQuestions(questions: Question[], adoptedIds: string[], message: string) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/questions/organize", token, {
        method: "POST",
        body: JSON.stringify({
          orderedQuestionIds: questions.map((question) => question.id),
          adoptedQuestionIds: adoptedIds
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "問題の並び順を保存できませんでした。");
      await loadDetail(token);
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "問題の並び順を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function openOrganizer() {
    if (!detail) return;
    setOrganizeDraft(detail.questions.map((question) => ({ ...question, draftAdopted: question.is_adopted })));
    setOrganizing(true);
    setError("");
    setNotice("");
  }

  function closeOrganizer() {
    setOrganizing(false);
    setOrganizeDraft([]);
  }

  function moveDraftQuestion(questionId: string, direction: -1 | 1) {
    setOrganizeDraft((current) => {
      const next = [...current];
      const index = next.findIndex((question) => question.id === questionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleDraftAdoption(questionId: string) {
    setOrganizeDraft((current) =>
      current.map((question) =>
        question.id === questionId
          ? { ...question, draftAdopted: !question.draftAdopted }
          : question
      )
    );
  }

  async function saveOrganizer() {
    if (!organizeDraft.length) return;
    await organizeQuestions(
      organizeDraft,
      organizeDraft.filter((question) => question.draftAdopted).map((question) => question.id),
      "表示順と採用設定を保存しました。"
    );
    setOrganizing(false);
    setOrganizeDraft([]);
  }

  function adoptOnlyNormalQuestions() {
    setOrganizeDraft((current) => current.map((question) => ({ ...question, draftAdopted: !question.is_practice })));
  }

  function adoptAllQuestions() {
    setOrganizeDraft((current) => current.map((question) => ({ ...question, draftAdopted: true })));
  }

  function returnAllToCandidates() {
    setOrganizeDraft((current) => current.map((question) => ({ ...question, draftAdopted: false })));
  }

  async function saveQuestionEdit(question: Question) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch(`/api/admin/questions/${question.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          answerTexts: editMode === "multiple_choice" ? [editAnswerTexts[0] || "1"] : cleanAnswerTexts(editAnswerTexts),
          mode: editMode,
          timeLimitMs: Math.max(1, Math.round(editTimeLimitSeconds)) * 1000,
          maxAttempts: editMaxAttempts,
          imagePath: editImage?.imagePath ?? question.image_path,
          imageUrl: editImage?.imageUrl ?? question.image_url,
          isPractice: editIsPractice
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "問題候補を更新できませんでした。");
      setEditingQuestionId(null);
      setEditImage(null);
      await loadDetail(token);
      setNotice("問題設定を保存しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "問題候補を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function startQuestionEdit(question: Question) {
    setEditingQuestionId(question.id);
    setEditMode(question.mode);
    setEditAnswerTexts(question.mode === "multiple_choice" ? [question.answer_text] : [question.answer_text, ...question.answer_aliases]);
    setEditTimeLimitSeconds(Math.max(1, Math.round(question.time_limit_ms / 1000)));
    setEditMaxAttempts(question.max_attempts);
    setEditImage(null);
    setEditIsPractice(question.is_practice);
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  const participantNameById = new Map(
    (detail?.participants || []).map((participant) => [participant.id, participant.name])
  );
  const adoptedQuestions = detail?.questions.filter((question) => question.is_adopted).sort((a, b) => a.order_index - b.order_index) || [];
  const displaySetCounts = detail?.room.set_question_counts || [detail?.room.questions_per_set || 7];
  const scoringSetCounts = adoptedQuestions.reduce<Map<number, number>>((counts, question) => {
    if (question.is_practice) return counts;
    const placement = questionPlacementBySetCounts(question.order_index, displaySetCounts);
    counts.set(placement.setNumber, (counts.get(placement.setNumber) || 0) + 1);
    return counts;
  }, new Map());
  const scoringCounts = [...scoringSetCounts.entries()].sort((a, b) => a[0] - b[0]).map(([, count]) => count);
  function displayPlacementFor(question: Question) {
    if (!question.is_adopted) return null;
    if (question.is_practice) {
      const practiceIndex = adoptedQuestions.filter((item) => item.is_practice && item.order_index <= question.order_index).length;
      return { setNumber: 0, label: alphabeticQuestionLabel(Math.max(0, practiceIndex - 1)) };
    }
    const scoringOrderIndex = adoptedQuestions.filter((item) => !item.is_practice && item.order_index <= question.order_index).length;
    return questionPlacementBySetCounts(scoringOrderIndex, scoringCounts);
  }
  const questionTitleById = new Map(
    (detail?.questions || []).map((question) => {
      const placement = displayPlacementFor(question);
      return [question.id, question.is_practice ? `例題・${placement?.label || ""}` : `セット${placement?.setNumber || ""}・${placement?.label || ""}`];
    })
  );
  const rankedSubmissions = useMemo(() => {
    const rows = detail?.room.current_question_id
      ? (detail.submissions || []).filter(
          (submission) => submission.question_id === detail.room.current_question_id
        )
      : detail?.submissions || [];

    return [...rows].sort((a, b) => {
      const aIsCorrect = a.final_status === "correct";
      const bIsCorrect = b.final_status === "correct";
      if (aIsCorrect !== bIsCorrect) {
        return aIsCorrect ? -1 : 1;
      }

      const aElapsed = a.answer_elapsed_ms ?? Number.POSITIVE_INFINITY;
      const bElapsed = b.answer_elapsed_ms ?? Number.POSITIVE_INFINITY;
      if (aElapsed !== bElapsed) {
        return aElapsed - bElapsed;
      }

      const aReceived = Date.parse(a.server_received_at || a.created_at);
      const bReceived = Date.parse(b.server_received_at || b.created_at);
      if (aReceived !== bReceived) {
        return aReceived - bReceived;
      }

      return a.id.localeCompare(b.id);
    });
  }, [detail]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="nav-links">
          <Link className="brand" href="/admin">
            出題者管理
          </Link>
        </div>
        <button className="button secondary" onClick={handleSignOut} type="button">
          ログアウト
        </button>
      </header>

      <section className="page stack">
        {loading ? <div className="panel">読み込み中...</div> : null}
        {error ? <div className="message error">{error}</div> : null}
        {notice ? <div className="message success">{notice}</div> : null}

        {detail ? (
          <>
            <div className="panel stack">
              <div className="action-row">
                <span className={`status ${roomStatusPresentation(detail.room.status).tone}`}>
                  {roomStatusPresentation(detail.room.status).label}
                </span>
                <h1>{detail.room.title}</h1>
              </div>
              <div className="action-row">
                <Link className="button" href="/admin/results" target="_blank">画面共有用の結果発表を開く</Link>
                <button className="button secondary" type="button" disabled={saving} onClick={() => void switchResults(!detail.room.show_results)}>{detail.room.show_results ? "参加者画面を通常表示に戻す" : "参加者画面を結果発表に切り替える"}</button>
                <span className="muted">参加者画面：{detail.room.show_results ? "結果発表" : "通常表示"}</span>
                <label className="field"><span>セットごとの問題数（例: 1,7,7,7）</span><input className="input" value={setQuestionCountsText} onChange={event => setSetQuestionCountsText(event.target.value)} /></label>
                <button className="button secondary" type="button" onClick={saveSetSize} disabled={saving}>セット設定を保存</button>
                <button className="button secondary" type="button" onClick={() => token && void loadDetail(token).catch(() => setError("成績を更新できませんでした。"))}>成績を更新</button>
              </div>

            </div>

            <div className="dashboard-grid">
              <div className="stack">
                <div className="panel stack">
                  <h2>問題候補の登録</h2>
                  <p className="muted">画像・正答・出題設定を1つの問題として登録します。例題は成績と結果発表から除外されます。</p>
                  <form className="form" onSubmit={handleCreateQuestion}>
                    <label className="field">
                      <span>問題画像</span>
                      <input className="input" type="file" accept="image/*" onChange={handleUpload} />
                    </label>
                    {uploading ? <div className="message notice">画像をアップロード中...</div> : null}
                    {uploadedImage?.imageUrl ? (
                      <img className="question-preview" src={uploadedImage.imageUrl} alt="アップロード画像" />
                    ) : null}
                    <label className="field"><span>問題モード</span><select className="input" value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); setAnswerTexts(next === "multiple_choice" ? ["1"] : [""]); }}><option value="normal">通常（文字入力）</option><option value="multiple_choice">4択（1〜4）</option></select></label>
                    {mode === "multiple_choice" ? <p className="muted">選択肢の内容は問題画像に1〜4で記載してください。</p> : null}
                    <label className="field inline-check"><input type="checkbox" checked={isPractice} onChange={event => setIsPractice(event.target.checked)} />例題として扱う（結果に集計しない）</label>
                    <div className="split">
                      {mode === "multiple_choice" ? (
                        <label className="field"><span>正答</span><select className="input" value={answerTexts[0] || "1"} onChange={event => setAnswerTexts([event.target.value])} required>{CHOICE_KEYS.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select></label>
                      ) : (
                        <div className="field">
                          <span>正答リスト</span>
                          <textarea
                            className="input answer-textarea"
                            value={answerTexts.join("\n")}
                            onChange={(event) => setAnswerTexts(splitAnswerText(event.target.value))}
                            maxLength={MAX_ANSWER_LENGTH * 20}
                            required
                          />
                        </div>
                      )}
                      <label className="field">
                        <span>制限時間（秒）</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={timeLimitSeconds}
                          onChange={(event) => setTimeLimitSeconds(Number(event.target.value))}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>解答可能回数</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={MAX_ALLOWED_ATTEMPTS}
                          value={maxAttempts}
                          onChange={(event) => setMaxAttempts(Number(event.target.value))}
                          required
                        />
                      </label>
                    </div>
                    <button className="button" type="submit" disabled={saving || uploading}>
                      {saving ? "登録中..." : "問題候補を登録"}
                    </button>
                  </form>
                </div>

                <div className="panel stack">
                  <h2>問題候補・採用・並び替え</h2>
                  <p className="muted">採用した問題は上から順に「セット1・A、B…」と自動で割り当てられます。</p>
                  <div className="action-row">
                    <button className="button" type="button" onClick={openOrganizer} disabled={saving || detail.questions.length === 0}>
                      表示順と採用をまとめて編集
                    </button>
                  </div>
                  {organizing ? (
                    <div className="organizer stack">
                      <div className="action-row">
                        <button className="button secondary" type="button" onClick={adoptOnlyNormalQuestions}>例題以外を採用</button>
                        <button className="button secondary" type="button" onClick={adoptAllQuestions}>すべて採用</button>
                        <button className="button secondary" type="button" onClick={returnAllToCandidates}>すべて候補</button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>順</th>
                              <th>採用</th>
                              <th>答え</th>
                              <th>表示</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {organizeDraft.map((question, index) => {
                              const adoptedBefore = organizeDraft
                                .slice(0, index + 1)
                                .filter((item) => item.draftAdopted);
                              const adoptedOrder = adoptedBefore.length;
                              const scoringOrder = adoptedBefore.filter((item) => !item.is_practice).length;
                              const placement = question.draftAdopted
                                ? question.is_practice
                                  ? { setNumber: 0, label: alphabeticQuestionLabel(adoptedBefore.filter((item) => item.is_practice).length - 1) }
                                  : questionPlacementBySetCounts(scoringOrder, displaySetCounts)
                                : null;
                              return (
                                <tr key={question.id}>
                                  <td>{index + 1}</td>
                                  <td>
                                    <input
                                      aria-label={`${question.answer_text}を採用`}
                                      type="checkbox"
                                      checked={question.draftAdopted}
                                      onChange={() => toggleDraftAdoption(question.id)}
                                    />
                                  </td>
                                  <td>{[question.answer_text, ...question.answer_aliases].join("\n")}</td>
                                  <td>
                                    {question.draftAdopted
                                      ? question.is_practice
                                        ? `例題・${placement?.label || adoptedOrder}`
                                        : `セット${placement?.setNumber || ""}・${placement?.label || adoptedOrder}`
                                      : "候補"}
                                  </td>
                                  <td>
                                    <div className="compact-actions">
                                      <button className="button secondary" type="button" disabled={index === 0} onClick={() => moveDraftQuestion(question.id, -1)}>上</button>
                                      <button className="button secondary" type="button" disabled={index === organizeDraft.length - 1} onClick={() => moveDraftQuestion(question.id, 1)}>下</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="action-row">
                        <button className="button" type="button" disabled={saving} onClick={() => void saveOrganizer()}>
                          確定して保存
                        </button>
                        <button className="button secondary" type="button" disabled={saving} onClick={closeOrganizer}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {detail.questions.length === 0 ? (
                    <p className="muted">問題がまだ登録されていません。</p>
                  ) : null}
                  <div className="stack">
                    {detail.questions.map((question, index) => {
                      const placement = displayPlacementFor(question);
                      return (
                      <div className="card stack" key={question.id}>
                        <div className="action-row">
                          <span className={`status ${question.is_adopted ? "open" : "waiting"}`}>
                            {placement ? `${question.is_practice ? "例題" : `セット${placement.setNumber}`}・${placement.label}` : "候補"}
                          </span>
                          {question.is_practice ? <span className="status waiting">例題</span> : null}
                          <span className={`status ${questionStatusPresentation(question.status).tone}`}>
                            {questionStatusPresentation(question.status).label}
                          </span>
                        </div>
                        {question.display_image_url ? (
                          <img
                            className="question-preview"
                            src={question.display_image_url}
                            alt="問題画像"
                          />
                        ) : null}
                        {editingQuestionId === question.id ? (
                          <div className="form">
                            <label className="field"><span>問題画像を上書き</span><input className="input" type="file" accept="image/*" onChange={(event) => void handleUpload(event, "edit")} /></label>
                            {editImage?.imageUrl ? <img className="question-preview" src={editImage.imageUrl} alt="差し替え画像" /> : null}
                            <label className="field"><span>問題モード</span><select className="input" value={editMode} onChange={event => { const next = event.target.value as typeof editMode; setEditMode(next); setEditAnswerTexts(next === "multiple_choice" ? ["1"] : [question.answer_text, ...question.answer_aliases]); }}><option value="normal">通常（文字入力）</option><option value="multiple_choice">4択（1〜4）</option></select></label>
                            <label className="field inline-check"><input type="checkbox" checked={editIsPractice} onChange={event => setEditIsPractice(event.target.checked)} />例題として扱う（結果に集計しない）</label>
                            {editMode === "multiple_choice" ? (
                              <label className="field"><span>正答</span><select className="input" value={editAnswerTexts[0] || "1"} onChange={(event) => setEditAnswerTexts([event.target.value])}>{CHOICE_KEYS.map((choice) => <option key={choice}>{choice}</option>)}</select></label>
                            ) : (
                              <div className="field">
                                <span>正答リスト</span>
                                <textarea
                                  className="input answer-textarea"
                                  value={editAnswerTexts.join("\n")}
                                  onChange={(event) => setEditAnswerTexts(splitAnswerText(event.target.value))}
                                  maxLength={MAX_ANSWER_LENGTH * 20}
                                  required
                                />
                              </div>
                            )}
                            <div className="split">
                              <label className="field"><span>制限時間（秒）</span><input className="input" type="number" min={1} value={editTimeLimitSeconds} onChange={(event) => setEditTimeLimitSeconds(Number(event.target.value))} /></label>
                              <label className="field"><span>解答可能回数</span><input className="input" type="number" min={1} max={MAX_ALLOWED_ATTEMPTS} value={editMaxAttempts} onChange={(event) => setEditMaxAttempts(Number(event.target.value))} /></label>
                            </div>
                            <div className="action-row"><button className="button" type="button" disabled={saving} onClick={() => void saveQuestionEdit(question)}>保存</button><button className="button secondary" type="button" onClick={() => setEditingQuestionId(null)}>キャンセル</button></div>
                          </div>
                        ) : (
                          <div className="muted">
                            {question.mode === "multiple_choice" ? "4択（1〜4）" : "通常"} / 制限時間 {formatElapsedTime(question.time_limit_ms)} / 解答可能回数 {question.max_attempts}回 / 正答 <strong>{[question.answer_text, ...question.answer_aliases].join(" / ")}</strong>
                          </div>
                        )}
                        <div className="action-row">
                          <button className="button secondary" type="button" disabled={saving} onClick={() => startQuestionEdit(question)}>設定を編集</button>
                          {question.is_adopted ? (
                          <button
                            className="button warning"
                            type="button"
                            onClick={() =>
                              runProgressAction(
                                "/api/admin/start-question",
                                { roomId, questionId: question.id },
                                `${question.is_practice ? "例題" : `セット${placement?.setNumber}`}・${placement?.label}を開始しますか？`
                              )
                            }
                          >
                            問題を開始
                          </button>
                          ) : null}
                          {detail.room.current_question_id === question.id ? (
                            <button
                              className="button danger"
                              type="button"
                              onClick={() =>
                                runProgressAction(
                                  "/api/admin/close-question",
                                  { roomId },
                                  "現在の問題を締め切りますか？"
                                )
                              }
                            >
                              解答を締切
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );})}
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel stack">
                  <h2>{detail.room.current_question_id ? "現在問題の解答結果" : "解答結果"}</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>順位</th>
                          <th>参加者</th>
                          <th>問題</th>
                          <th>解答</th>
                          <th>結果</th>
                          <th>試行回数</th>
                          <th>回答時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedSubmissions.map((submission, index) => (
                          <tr key={submission.id}>
                            <td>{index + 1}</td>
                            <td>{participantNameById.get(submission.participant_id) || "不明"}</td>
                            <td>{questionTitleById.get(submission.question_id) || "不明"}</td>
                            <td>{submission.submitted_answer}</td>
                            <td>
                              {submission.final_status === "correct"
                                ? submission.answered_before_reveal
                                  ? "正解（画像表示前）"
                                  : "正解"
                                : submission.final_status === "timeout"
                                  ? "タイムアップ"
                                  : submission.final_status === "attempt_limit_exceeded"
                                    ? "回数上限"
                                    : submission.is_correct
                                      ? "正解"
                                      : "不正解"}
                            </td>
                            <td>
                              {submission.attempt_count}
                              {submission.max_attempts_snapshot
                                ? ` / ${submission.max_attempts_snapshot}`
                                : ""}
                            </td>
                            <td>
                              {typeof submission.answer_elapsed_ms === "number"
                                ? formatElapsedTime(submission.answer_elapsed_ms)
                                : "-"}
                            </td>
                          </tr>
                        ))}
                        {rankedSubmissions.length === 0 ? (
                          <tr>
                            <td colSpan={7}>まだ解答はありません。</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel stack">
                  <h2>参加者の成績（総合・セット別）</h2>
                  <p className="muted">総合の正解数が多い順、同数なら正解タイム合計が短い順です。タイム未記録がある成績は同正解数の記録済み成績の後に表示します。</p>
                  {[...detail.participants].sort((a, b) => b.results.correctCount - a.results.correctCount || a.results.missingTimeCount - b.results.missingTimeCount || a.results.totalTimeMs - b.results.totalTimeMs).map((participant, index) => (
                    <div className="card stack" key={participant.id}>
                      <h3>{index + 1}. {participant.name}</h3>
                      <ResultsSummary results={participant.results} />
                    </div>
                  ))}
                  {detail.participants.length === 0 ? <p className="muted">参加者はいません。</p> : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
