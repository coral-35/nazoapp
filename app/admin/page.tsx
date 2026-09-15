import { defaultRoomId } from "@/lib/default-room";
import { EventManager } from "@/app/components/event-manager";
export default function AdminPage() { return <EventManager roomId={defaultRoomId()} />; }
