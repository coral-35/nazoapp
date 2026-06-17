"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { participantStorageKey } from "@/lib/participant-storage";

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!participantName.trim()) {
      setError("参加者名を入力してください。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/join-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, participantName })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "ルーム参加に失敗しました。");
      }

      localStorage.setItem(
        participantStorageKey(data.room.roomCode),
        JSON.stringify({
          participantToken: data.participantToken,
          participantName: data.participant.name,
          roomCode: data.room.roomCode
        })
      );

      router.push(`/play/${data.room.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ルーム参加に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          謎解き企画アプリ
        </Link>
      </header>

      <section className="narrow-page">
        <div className="panel stack">
          <div>
            <span className="status waiting">参加者</span>
            <h1>ルームに参加</h1>
            <p className="muted">出題者から共有されたルーム番号と名前を入力してください。</p>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span>ルーム番号</span>
              <input
                className="input"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                autoComplete="off"
                inputMode="text"
                required
              />
            </label>
            <label className="field">
              <span>参加者名</span>
              <input
                className="input"
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>

            {error ? <div className="message error">{error}</div> : null}

            <button className="button" disabled={loading} type="submit">
              {loading ? "参加中..." : "参加する"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
