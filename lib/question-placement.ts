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

export function fullWidthNumber(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error("数値が不正です。");
  return String(value).replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0));
}

export function formatQuestionPlacement(setNumber: number, label: string): string {
  return `セット${fullWidthNumber(setNumber)}・${label}`;
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

export function normalizeSetQuestionCounts(value: unknown, fallback = 7): number[] {
  const source = Array.isArray(value) ? value : [fallback];
  const counts = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 1000);
  return counts.length ? counts : [fallback];
}

export function questionPlacementBySetCounts(orderIndex: number, setQuestionCounts: number[]) {
  if (!Number.isInteger(orderIndex) || orderIndex < 1) {
    throw new Error("問題配置が不正です。");
  }
  const counts = normalizeSetQuestionCounts(setQuestionCounts);
  let remaining = orderIndex;
  for (let index = 0; index < counts.length; index += 1) {
    if (remaining <= counts[index]) {
      return { setNumber: index + 1, label: alphabeticQuestionLabel(remaining - 1) };
    }
    remaining -= counts[index];
  }
  const repeatedSize = counts[counts.length - 1];
  const extraSetOffset = Math.floor((remaining - 1) / repeatedSize);
  return {
    setNumber: counts.length + 1 + extraSetOffset,
    label: alphabeticQuestionLabel((remaining - 1) % repeatedSize)
  };
}
