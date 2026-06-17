"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetch, getAdminAccessToken } from "@/lib/admin-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Room = {
  id: string;
  room_code: string;
  title: string;
  status: string;
  created_at: string;
};

export default function AdminRoomsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadRooms(accessToken: string) {
    const response = await adminFetch("/api/admin/rooms", accessToken);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "ルーム一覧を取得できませんでした。");
    }
    setRooms(data.rooms);
  }

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
        await loadRooms(accessToken);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "管理画面を読み込めませんでした。");
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
  }, [router]);

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setCreating(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/create-room", token, {
        method: "POST",
        body: JSON.stringify({ title })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "ルーム作成に失敗しました。");
      }
      setTitle("");
      await loadRooms(token);
      router.push(`/admin/rooms/${data.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ルーム作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          謎解き企画アプリ
        </Link>
        <button className="button secondary" onClick={handleSignOut} type="button">
          ログアウト
        </button>
      </header>

      <section className="page stack">
        <div>
          <span className="status waiting">出題者</span>
          <h1>ルーム一覧</h1>
        </div>

        {loading ? <div className="panel">読み込み中...</div> : null}
        {error ? <div className="message error">{error}</div> : null}

        <div className="dashboard-grid">
          <div className="panel stack">
            <h2>作成済みルーム</h2>
            {rooms.length === 0 ? <p className="muted">まだルームがありません。</p> : null}
            <div className="stack">
              {rooms.map((room) => (
                <Link className="card stack" href={`/admin/rooms/${room.id}`} key={room.id}>
                  <div className="action-row">
                    <strong>{room.title}</strong>
                    <span className="status waiting">{room.status}</span>
                  </div>
                  <div>
                    <span className="muted">ルーム番号 </span>
                    <span className="room-code">{room.room_code}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="panel stack">
            <h2>ルーム作成</h2>
            <form className="form" onSubmit={handleCreateRoom}>
              <label className="field">
                <span>ルーム名</span>
                <input
                  className="input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>
              <button className="button" type="submit" disabled={creating || !token}>
                {creating ? "作成中..." : "ルームを作成"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
