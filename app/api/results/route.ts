import { NextRequest, NextResponse } from "next/server";
import { GET as getMyScore } from "@/app/api/my-score/route";
import { getDefaultRoom } from "@/lib/default-room.server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { loadResults } from "@/lib/results.server";

export async function GET(request: NextRequest) {
  const room = await getDefaultRoom();
  const authUrl = new URL(request.url);
  authUrl.searchParams.set("room_code", room.room_code);
  const auth = await getMyScore(new NextRequest(authUrl, { headers: request.headers }));
  if (!auth.ok) return auth;
  const db = getSupabaseAdmin();
  const { data: settings, error } = await db.from("event_settings").select("id, title, questions_per_set, show_results").eq("id", room.id).single();
  if (error || !settings) return NextResponse.json({ error: "設定を取得できませんでした。" }, { status: 500 });
  if (!settings.show_results) return NextResponse.json({ error: "結果発表はまだ開始されていません。" }, { status: 403 });
  const { data: participants, error: participantsError } = await db.from("participants").select("id, name").eq("event_id", room.id);
  const { data: questions, count, error: questionError } = await db.from("questions").select("order_index", { count: "exact" }).eq("event_id", room.id).eq("is_adopted", true).order("order_index", { ascending: false }).limit(1);
  if (participantsError || questionError) return NextResponse.json({ error: "結果を取得できませんでした。" }, { status: 500 });
  const resultsFor = await loadResults(room.id, settings.questions_per_set);
  return NextResponse.json({ room: settings, scores: (participants || []).map(p => ({ ...p, ...resultsFor(p.id) })), questionCount: count || 0,
    setCount: Math.ceil((questions?.[0]?.order_index || 0) / settings.questions_per_set) }, { headers: { "Cache-Control": "no-store" } });
}
