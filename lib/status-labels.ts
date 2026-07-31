export type StatusPresentation = {
  label: string;
  tone: "waiting" | "open" | "closed";
};

const ROOM_STATUS: Record<string, StatusPresentation> = {
  draft: { label: "準備中", tone: "waiting" },
  waiting: { label: "待機中", tone: "waiting" },
  question_open: { label: "出題中", tone: "open" },
  question_closed: { label: "締切済み", tone: "closed" },
  finished: { label: "終了", tone: "closed" }
};

const QUESTION_STATUS: Record<string, StatusPresentation> = {
  draft: { label: "準備中", tone: "waiting" },
  open: { label: "受付中", tone: "open" },
  closed: { label: "締切済み", tone: "closed" }
};

const UNKNOWN_STATUS: StatusPresentation = { label: "状態不明", tone: "waiting" };

export function roomStatusPresentation(status: string): StatusPresentation {
  return ROOM_STATUS[status] || UNKNOWN_STATUS;
}

export function questionStatusPresentation(status: string): StatusPresentation {
  return QUESTION_STATUS[status] || UNKNOWN_STATUS;
}
