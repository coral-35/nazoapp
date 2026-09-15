import { formatElapsedTime } from "@/lib/answer";
import type { Results, ResultTotals } from "@/lib/results";

export function resultTime(result: ResultTotals) {
  return `${formatElapsedTime(result.totalTimeMs)}${result.missingTimeCount ? `（別途${result.missingTimeCount}問のタイム未記録）` : ""}`;
}

export function ResultsSummary({ results }: { results: Results }) {
  return <div className="stack">
    <div><strong>総合：{results.correctCount}問正解 / {resultTime(results)}</strong></div>
    {results.sets.map(set => <div key={set.setNumber}>セット{set.setNumber}：{set.correctCount}問正解 / {resultTime(set)}</div>)}
    <small className="muted">タイムは正解した問題のみの合計です。</small>
  </div>;
}
