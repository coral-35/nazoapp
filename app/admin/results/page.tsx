import { defaultRoomId } from "@/lib/default-room";
import { EventResults } from "@/app/components/event-results";
export default function ResultsPage() { return <EventResults roomId={defaultRoomId()} />; }
