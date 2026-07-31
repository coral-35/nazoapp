export type JoinRoomRecord = {
  id: string;
  room_code: string;
  title: string;
  status: string;
};

export type JoinParticipantRecord = {
  id: string;
  name: string;
  total_score: number;
};

export function buildJoinRoomResponse(
  room: JoinRoomRecord,
  participant: JoinParticipantRecord,
  participantToken: string
) {
  return {
    room: {
      id: room.id,
      roomCode: room.room_code,
      title: room.title,
      status: room.status
    },
    participant: {
      id: participant.id,
      name: participant.name,
      totalScore: participant.total_score
    },
    participantToken
  };
}
