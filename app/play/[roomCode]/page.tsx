"use client";

import { useParams } from "next/navigation";
import { RoomPlayer } from "@/app/components/room-player";

export default function LegacyPlayPage() {
  const params = useParams<{ roomCode: string }>();
  return <RoomPlayer roomCode={String(params.roomCode || "").toUpperCase()} />;
}
