export function alphabeticQuestionLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error("問題位置が不正です。");
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function questionPlacement(orderIndex: number, questionsPerSet: number) {
  if (!Number.isInteger(orderIndex) || orderIndex < 1 || !Number.isInteger(questionsPerSet) || questionsPerSet < 1) {
    throw new Error("問題配置が不正です。");
  }
  const index = orderIndex - 1;
  return {
    setNumber: Math.floor(index / questionsPerSet) + 1,
    label: alphabeticQuestionLabel(index % questionsPerSet)
  };
}
