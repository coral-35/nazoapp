"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetch, getAdminAccessToken } from "@/lib/admin-client";
import { rankResults, type ResultParticipant } from "@/lib/results";

type ResultsResponse = {
  room: { id: string; title: string; room_code: string; questions_per_set: number };
  scores: ResultParticipant[];
  questionCount: number;
  setCount: number;
};

function displayTime(ms: number) {
  return `${(ms / 1000).toFixed(3)}秒`;
}

export function EventResults({ roomId, participantToken }: { roomId: string; participantToken?: string }) {
  const router = useRouter();
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [selectedSet, setSelectedSet] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const token = participantToken ? null : await getAdminAccessToken();
      if (signal?.aborted) return;
      if (!participantToken && !token) { router.replace("/admin/login"); return; }
      const response = participantToken
        ? await fetch(`/api/results?participant_token=${encodeURIComponent(participantToken)}`, { cache: "no-store", signal })
        : await adminFetch(`/api/admin/scores?roomId=${encodeURIComponent(roomId)}`, token!, { cache: "no-store", signal });
      if (response.status === 401 || (!participantToken && response.status === 403)) { router.replace(participantToken ? "/join" : "/admin/login"); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "結果を取得できませんでした。");
      if (signal?.aborted) return;
      setData(result);
      setSelectedSet(current => current !== null && current > result.setCount ? null : current);
      setUpdatedAt(new Date().toLocaleTimeString("ja-JP"));
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "結果を取得できませんでした。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [roomId, router, participantToken]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const ranked = useMemo(() => rankResults(data?.scores || [], selectedSet), [data, selectedSet]);
  const tabs = [null, ...Array.from({ length: data?.setCount || 0 }, (_, i) => i + 1)];
  const title = selectedSet === null ? "総合結果" : `セット${selectedSet}の結果`;
  const hasMissingTime = ranked.some(row => row.result.missingTimeCount > 0);

  return (
    <main className="app-shell results-page">
      <header className="topbar">
        {participantToken ? <span className="brand">結果発表</span> : <Link className="brand" href="/admin">出題者管理へ戻る</Link>}
        <button className="button secondary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "更新中…" : "結果を更新"}
        </button>
      </header>
      <section className="page stack">
        <div className="announcement-heading">
          <span className="results-eyebrow">QUIZ CHAMPIONSHIP · FINAL SCORE</span>
          <h1>結果発表</h1>
          {data ? <p>{data.room.title}</p> : null}
          <p className="muted">正解数が多い順 → 正解した問題の合計タイムが短い順</p>
        </div>
        {error ? <div className="message error" role="alert">{error}{data ? " 前回取得した結果を表示しています。" : ""}</div> : null}
        {loading && !data ? <div className="panel" role="status">結果を読み込み中…</div> : null}
        {data ? <>
          {ranked.length > 0 ? <div className="winner-board" aria-label="上位の成績">
            {ranked.slice(0, 3).map(row => <article className={`winner-card winner-${row.rank}`} key={row.id}>
              <div className="winner-place">{row.rank === 1 ? "TOP RANK" : "RANK"} <strong>{row.rank}</strong></div>
              <h2>{row.name}</h2>
              <div className="winner-score"><strong>{row.result.correctCount}</strong><span>問正解</span></div>
              <div className="winner-time">{row.result.missingTimeCount ? "タイム未記録あり" : displayTime(row.result.totalTimeMs)}</div>
            </article>)}
          </div> : null}
          <div className="results-stats">
            <div><strong>{data.scores.length}</strong><span>参加者</span></div>
            <div><strong>{data.setCount}</strong><span>セット</span></div>
            <div><strong>{data.questionCount}</strong><span>問題</span></div>
          </div>
          <div className="result-tabs" role="tablist" aria-label="結果の集計範囲">
            {tabs.map((set, index) => <button
              key={set ?? "overall"} id={`result-tab-${set ?? "overall"}`} type="button" role="tab"
              aria-selected={selectedSet === set} aria-controls="result-panel" tabIndex={selectedSet === set ? 0 : -1}
              onClick={() => setSelectedSet(set)}
              onKeyDown={event => {
                let next: number;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                else return;
                event.preventDefault();
                setSelectedSet(tabs[next]);
                document.getElementById(`result-tab-${tabs[next] ?? "overall"}`)?.focus();
              }}
            >{set === null ? "総合結果" : `セット${set}`}</button>)}
          </div>
          <section className="panel stack leaderboard" role="tabpanel" id="result-panel" aria-labelledby={`result-tab-${selectedSet ?? "overall"}`} tabIndex={0}>
            <div className="leaderboard-heading">
              <h2>{title}</h2>
              <span className="muted">最終更新 {updatedAt}</span>
            </div>
            <p className="muted">{selectedSet === null ? "すべてのセットを合算しています。" : `第${(selectedSet - 1) * data.room.questions_per_set + 1}問からの${data.room.questions_per_set}問を集計します（最後のセットは端数を含みます）。`} 同じ正解数・タイムは同順位です。</p>
            {hasMissingTime ? <p className="message notice">タイム未記録を含む成績は、同じ正解数の記録済み成績の後に表示します。</p> : null}
            {ranked.length ? <div className="table-wrap">
              <table className="results-table">
                <caption className="sr-only">{title}：正解数の降順、正解タイム合計の昇順</caption>
                <thead><tr><th scope="col">順位</th><th scope="col">参加者</th><th scope="col">正解数</th><th scope="col">正解タイム合計</th></tr></thead>
                <tbody>{ranked.map(row => <tr key={row.id} className={row.rank <= 3 ? `place-${row.rank}` : ""}>
                  <td><span className="rank-number">{row.rank}</span><span className="rank-unit">位</span></td>
                  <th scope="row">{row.name}</th>
                  <td><strong>{row.result.correctCount}</strong><span className="rank-unit">問</span></td>
                  <td className="result-time">{row.result.missingTimeCount ? <>{displayTime(row.result.totalTimeMs)}<small>別途{row.result.missingTimeCount}問のタイム未記録</small></> : displayTime(row.result.totalTimeMs)}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="muted">参加者はまだいません。</p>}
            <small className="muted">不正解・時間切れ・未回答のタイムは合計に含みません。タイムはミリ秒単位で比較しています。</small>
          </section>
        </> : null}
      </section>
    </main>
  );
}
