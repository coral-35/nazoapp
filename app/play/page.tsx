import Link from "next/link";
import { getDefaultRoom } from "@/lib/default-room.server";
import { RoomPlayer } from "@/app/components/room-player";

export const dynamic = "force-dynamic";

export default async function DefaultPlayPage() {
  let room;
  try { room = await getDefaultRoom(); } catch {
    return <main className="narrow-page"><div className="panel stack">
      <h1>参加先を確認できませんでした</h1>
      <p>出題者に確認するか、時間をおいて再度アクセスしてください。</p>
      <Link className="button" href="/join">エントリー画面へ</Link>
    </div></main>;
  }
  return <RoomPlayer roomCode={room.room_code} />;
}
