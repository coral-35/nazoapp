import { NextResponse } from "next/server";
import { getDefaultRoom } from "@/lib/default-room.server";

export async function GET() {
  try {
    const room = await getDefaultRoom();
    return NextResponse.json({ roomCode: room.room_code, title: room.title, status: room.status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "参加先がまだ準備されていません。出題者に確認してください。" }, { status: 503 });
  }
}
