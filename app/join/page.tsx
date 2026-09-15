"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { participantStorageKey, restoreStoredParticipant } from "@/lib/participant-storage";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/input-limits";

type EntryRoom = { roomCode: string; title: string; status: string };

export default function JoinPage() {
  const router = useRouter();
  const [room, setRoom] = useState<EntryRoom | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const checkEntry = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setError("");
    setRoom(null);
    try {
      const response = await fetch("/api/default-room", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "参加先を取得できませんでした。");
      const saved = await restoreStoredParticipant(localStorage, data.roomCode, async participant => {
        const query = new URLSearchParams({ room_code: data.roomCode, participant_token: participant.participantToken });
        const response = await fetch(`/api/my-score?${query}`, { cache: "no-store", signal });
        return response.status;
      });
      if (saved && !signal?.aborted) { router.replace("/play"); return; }
      if (!signal?.aborted) setRoom(data);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "参加先を確認できませんでした。");
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void checkEntry(controller.signal);
    return () => controller.abort();
  }, [checkEntry]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || loading) return;
    if (!participantName.trim()) { setError("参加者名を入力してください。"); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/join-room", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "参加登録に失敗しました。");
      localStorage.setItem(participantStorageKey(data.room.roomCode), JSON.stringify({
        participantToken: data.participantToken, participantName: data.participant.name, roomCode: data.room.roomCode
      }));
      router.replace("/play");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参加登録に失敗しました。");
    } finally { setLoading(false); }
  }

  return <main className="app-shell">
    <header className="topbar">
      <Link className="brand" href="/">謎解き企画アプリ</Link>
      <Link href="/admin/login">出題者ログイン</Link>
    </header>
    <section className="narrow-page">
      <div className="panel stack">
        <div><span className="status waiting">エントリー</span><h1>名前を入力して参加</h1>
          {room ? <p className="muted">{room.title}</p> : null}
        </div>
        {checking ? <p role="status">参加情報を確認中…</p> : null}
        {error ? <div className="message error" role="alert">{error}</div> : null}
        {!checking && !room ? <button className="button" onClick={() => void checkEntry()} type="button">再試行</button> : null}
        {!checking && room ? room.status === "draft" || room.status === "finished"
          ? <p className="message notice">現在は新規参加を受け付けていません。</p>
          : <form className="form" onSubmit={handleSubmit}>
            <label className="field"><span>参加者名</span><input className="input" value={participantName}
              onChange={event => setParticipantName(event.target.value)} autoComplete="name"
              maxLength={MAX_PARTICIPANT_NAME_LENGTH} required disabled={loading} /></label>
            <button className="button" disabled={loading} type="submit">{loading ? "参加中…" : "参加する"}</button>
          </form> : null}
      </div>
    </section>
  </main>;
}
