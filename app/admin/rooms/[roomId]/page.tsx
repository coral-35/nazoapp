"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { adminFetch, getAdminAccessToken } from "@/lib/admin-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RoomDetail = {
  room: {
    id: string;
    room_code: string;
    title: string;
    status: string;
    current_question_id: string | null;
  };
  questions: Question[];
  participants: Participant[];
  submissions: Submission[];
};

type Question = {
  id: string;
  title: string;
  display_image_url: string | null;
  answer_text: string;
  points: number;
  order_index: number;
  status: string;
};

type Participant = {
  id: string;
  name: string;
  total_score: number;
  created_at: string;
};

type Submission = {
  id: string;
  participant_id: string;
  question_id: string;
  submitted_answer: string;
  is_correct: boolean;
  awarded_points: number;
  created_at: string;
};

type UploadedImage = {
  imagePath: string;
  imageUrl: string | null;
};

export default function AdminRoomDetailPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = String(params.roomId || "");
  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questionTitle, setQuestionTitle] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [points, setPoints] = useState(10);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadDetail = useCallback(
    async (accessToken: string) => {
      const response = await adminFetch(`/api/admin/rooms/${roomId}`, accessToken, {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "ルーム情報を取得できませんでした。");
      }
      setDetail(data);
    },
    [roomId]
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
          setError(caught instanceof Error ? caught.message : "ルーム情報を読み込めませんでした。");
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

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
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
      setUploadedImage(data);
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
          title: questionTitle,
          answerText,
          points,
          imagePath: uploadedImage?.imagePath,
          imageUrl: uploadedImage?.imageUrl
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "問題登録に失敗しました。");
      }
      setQuestionTitle("");
      setAnswerText("");
      setPoints(10);
      setUploadedImage(null);
      setNotice("問題を登録しました。");
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

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  const participantNameById = new Map(
    (detail?.participants || []).map((participant) => [participant.id, participant.name])
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="nav-links">
          <Link className="brand" href="/admin/rooms">
            ルーム一覧
          </Link>
          <Link className="link-button" href="/join">
            参加画面
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
                <span className="status waiting">{detail.room.status}</span>
                <h1>{detail.room.title}</h1>
              </div>
              <div>
                <span className="muted">参加者へ共有するルーム番号 </span>
                <span className="room-code">{detail.room.room_code}</span>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="stack">
                <div className="panel stack">
                  <h2>問題登録</h2>
                  <form className="form" onSubmit={handleCreateQuestion}>
                    <label className="field">
                      <span>問題タイトル</span>
                      <input
                        className="input"
                        value={questionTitle}
                        onChange={(event) => setQuestionTitle(event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>問題画像</span>
                      <input className="input" type="file" accept="image/*" onChange={handleUpload} />
                    </label>
                    {uploading ? <div className="message notice">画像をアップロード中...</div> : null}
                    {uploadedImage?.imageUrl ? (
                      <img className="question-preview" src={uploadedImage.imageUrl} alt="アップロード画像" />
                    ) : null}
                    <div className="split">
                      <label className="field">
                        <span>正答</span>
                        <input
                          className="input"
                          value={answerText}
                          onChange={(event) => setAnswerText(event.target.value)}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>配点</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={points}
                          onChange={(event) => setPoints(Number(event.target.value))}
                          required
                        />
                      </label>
                    </div>
                    <button className="button" type="submit" disabled={saving || uploading}>
                      {saving ? "登録中..." : "問題を登録"}
                    </button>
                  </form>
                </div>

                <div className="panel stack">
                  <h2>問題一覧・進行操作</h2>
                  {detail.questions.length === 0 ? (
                    <p className="muted">問題がまだ登録されていません。</p>
                  ) : null}
                  <div className="stack">
                    {detail.questions.map((question) => (
                      <div className="card stack" key={question.id}>
                        <div className="action-row">
                          <span className={`status ${question.status === "open" ? "open" : "waiting"}`}>
                            {question.status}
                          </span>
                          <strong>
                            第{question.order_index}問 {question.title}
                          </strong>
                        </div>
                        {question.display_image_url ? (
                          <img
                            className="question-preview"
                            src={question.display_image_url}
                            alt={`${question.title}の画像`}
                          />
                        ) : null}
                        <div className="muted">
                          配点 {question.points} / 正答 {question.answer_text}
                        </div>
                        <div className="action-row">
                          <button
                            className="button warning"
                            type="button"
                            onClick={() =>
                              runProgressAction(
                                "/api/admin/start-question",
                                { roomId, questionId: question.id },
                                `第${question.order_index}問を開始しますか？`
                              )
                            }
                          >
                            問題を開始
                          </button>
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
                    ))}
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="panel stack">
                  <h2>参加者一覧</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>名前</th>
                          <th>得点</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.participants.map((participant) => (
                          <tr key={participant.id}>
                            <td>{participant.name}</td>
                            <td>{participant.total_score}</td>
                          </tr>
                        ))}
                        {detail.participants.length === 0 ? (
                          <tr>
                            <td colSpan={2}>参加者はいません。</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel stack">
                  <h2>得点一覧</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>順位</th>
                          <th>名前</th>
                          <th>得点</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...detail.participants]
                          .sort((a, b) => b.total_score - a.total_score)
                          .map((participant, index) => (
                            <tr key={participant.id}>
                              <td>{index + 1}</td>
                              <td>{participant.name}</td>
                              <td>{participant.total_score}</td>
                            </tr>
                          ))}
                        {detail.participants.length === 0 ? (
                          <tr>
                            <td colSpan={3}>得点データはありません。</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel stack">
                  <h2>直近の解答</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>参加者</th>
                          <th>解答</th>
                          <th>結果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.submissions.map((submission) => (
                          <tr key={submission.id}>
                            <td>{participantNameById.get(submission.participant_id) || "不明"}</td>
                            <td>{submission.submitted_answer}</td>
                            <td>{submission.is_correct ? "正解" : "不正解"}</td>
                          </tr>
                        ))}
                        {detail.submissions.length === 0 ? (
                          <tr>
                            <td colSpan={3}>まだ解答はありません。</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
