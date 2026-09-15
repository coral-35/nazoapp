export type ResultQuestion = { id: string; order_index: number };
export type ResultSubmission = {
  question_id: string;
  is_correct: boolean;
  answer_elapsed_ms: number | null;
};
export type ResultTotals = { correctCount: number; totalTimeMs: number; missingTimeCount: number };
export type Results = ResultTotals & { sets: (ResultTotals & { setNumber: number })[] };

export function aggregateResults(questions: ResultQuestion[], submissions: ResultSubmission[], questionsPerSet: number): Results {
  if (!Number.isInteger(questionsPerSet) || questionsPerSet < 1 || questionsPerSet > 1000) {
    throw new Error("セット問題数が不正です。");
  }
  const sets = Array.from({ length: Math.ceil(Math.max(0, ...questions.map(q => q.order_index)) / questionsPerSet) }, (_, i) => ({
    setNumber: i + 1, correctCount: 0, totalTimeMs: 0, missingTimeCount: 0
  }));
  const totals: Results = { correctCount: 0, totalTimeMs: 0, missingTimeCount: 0, sets };
  const correct = new Map<string, ResultSubmission>();
  for (const row of submissions) {
    if (!row.is_correct) continue;
    const previous = correct.get(row.question_id);
    if (!previous || (row.answer_elapsed_ms ?? Infinity) < (previous.answer_elapsed_ms ?? Infinity)) correct.set(row.question_id, row);
  }
  for (const question of questions) {
    const row = correct.get(question.id);
    if (!row) continue;
    const set = sets[Math.floor((question.order_index - 1) / questionsPerSet)];
    for (const result of [totals, set]) {
      result.correctCount += 1;
      if (row.answer_elapsed_ms === null) result.missingTimeCount += 1;
      else result.totalTimeMs += row.answer_elapsed_ms;
    }
  }
  return totals;
}

export const QUESTION_MODES = ["normal", "multiple_choice"] as const;
export const CHOICE_KEYS = ["A", "B", "C", "D"] as const;
export function isValidQuestionMode(mode: unknown): mode is typeof QUESTION_MODES[number] {
  return mode === "normal" || mode === "multiple_choice";
}
export function isChoiceAnswer(answer: string): boolean {
  return CHOICE_KEYS.some(key => key === answer);
}

export type ResultParticipant = Results & { id: string; name: string };

export function rankResults(participants: ResultParticipant[], setNumber: number | null = null) {
  const rows = participants.map(participant => ({
    id: participant.id,
    name: participant.name,
    result: setNumber === null ? participant : participant.sets.find(set => set.setNumber === setNumber)
      ?? { correctCount: 0, totalTimeMs: 0, missingTimeCount: 0 }
  }));
  // An unknown total cannot be compared as if the missing time were zero.
  const time = (result: ResultTotals) => result.missingTimeCount ? Infinity : result.totalTimeMs;
  rows.sort((a, b) => b.result.correctCount - a.result.correctCount
    || time(a.result) - time(b.result)
    || a.name.localeCompare(b.name, "ja") || a.id.localeCompare(b.id));
  let rank = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous || row.result.correctCount !== previous.result.correctCount || time(row.result) !== time(previous.result)) rank = index + 1;
    return { ...row, rank };
  });
}
