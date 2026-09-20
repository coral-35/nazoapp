export type ResultQuestion = { id: string; order_index: number };
export type ResultSubmission = {
  question_id: string;
  is_correct: boolean;
  answer_elapsed_ms: number | null;
};
export type ResultTotals = { correctCount: number; totalTimeMs: number; missingTimeCount: number };
export type Results = ResultTotals & { sets: (ResultTotals & { setNumber: number })[] };

function normalizeResultSetQuestionCounts(value: number | number[]): number[] {
  const source = Array.isArray(value) ? value : [value];
  const counts = source.filter((item) => Number.isInteger(item) && item >= 1 && item <= 1000);
  if (!counts.length || counts.length !== source.length) throw new Error("セット問題数が不正です。");
  return counts;
}

function resultQuestionSetNumber(orderIndex: number, setQuestionCounts: number[]) {
  let remaining = orderIndex;
  for (let index = 0; index < setQuestionCounts.length; index += 1) {
    if (remaining <= setQuestionCounts[index]) return index + 1;
    remaining -= setQuestionCounts[index];
  }
  const repeatedSize = setQuestionCounts[setQuestionCounts.length - 1];
  return setQuestionCounts.length + 1 + Math.floor((remaining - 1) / repeatedSize);
}

export function aggregateResults(questions: ResultQuestion[], submissions: ResultSubmission[], questionsPerSet: number | number[]): Results {
  const setQuestionCounts = normalizeResultSetQuestionCounts(questionsPerSet);
  const setCount = questions.reduce((max, question) => Math.max(max, resultQuestionSetNumber(question.order_index, setQuestionCounts)), 0);
  const sets = Array.from({ length: setCount }, (_, i) => ({
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
    const set = sets[resultQuestionSetNumber(question.order_index, setQuestionCounts) - 1];
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
