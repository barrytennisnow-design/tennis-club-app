"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function isoDaysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

export default function AdminMatchesPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [activePlayers, setActivePlayers] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDaysFromNow(0));
  const [endDate, setEndDate] = useState(isoDaysFromNow(7));
  const [swapTarget, setSwapTarget] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(id, name), match_players(id, response_status, player_id, players(id, first_name, last_name))")
      .order("match_date", { ascending: true });
    setMatches(data ?? []);

    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);

    const { data: playerRows } = await supabase.from("players").select("id, first_name, last_name").eq("status", "active").order("last_name");
    setActivePlayers(playerRows ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setLastResult(null);
    const res = await fetch("/api/generate-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    const json = await res.json();
    setGenerating(false);
    if (json.ok) {
      const totalMatches = json.results.reduce((s: number, r: any) => s + r.matchesCreated, 0);
      setLastResult(`Created ${totalMatches} new match(es) across ${json.results.length} day(s).`);
      load();
    } else {
      setLastResult(`Error: ${json.error}`);
    }
  }

  async function handleAssignCourt(matchId: string, courtId: string) {
    await fetch("/api/admin/assign-court", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, court_id: courtId || null }),
    });
    load();
  }

  async function handleSwap(matchId: string, oldPlayerId: string) {
    const key = `${matchId}_${oldPlayerId}`;
    const newPlayerId = swapTarget[key];
    if (!newPlayerId) return;
    await fetch("/api/admin/swap-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, old_player_id: oldPlayerId, new_player_id: newPlayerId }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Matches</h1>

      <div className="rounded-md border p-4 space-y-3">
        <p className="font-medium">Generate matches from current availability</p>
        <div className="flex items-center gap-3 text-sm">
          <label>From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="ml-1 rounded border border-stone-300 px-2 py-1" /></label>
          <label>To <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="ml-1 rounded border border-stone-300 px-2 py-1" /></label>
          <button onClick={handleGenerate} disabled={generating}
            className="rounded-md bg-court-green px-4 py-2 text-white disabled:opacity-50">
            {generating ? "Generating..." : "Generate Matches"}
          </button>
        </div>
        {lastResult && <p className="text-sm text-stone-600">{lastResult}</p>}
      </div>

      <div className="space-y-3">
        {matches.map((m) => {
          const playerIdsInMatch = new Set(m.match_players.map((mp: any) => mp.player_id));
          const swapOptions = activePlayers.filter((p) => !playerIdsInMatch.has(p.id));

          return (
            <div key={m.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {m.match_date} · {m.time_slot}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  m.status === "confirmed" ? "bg-green-100 text-green-800" :
                  m.status === "cancelled" ? "bg-red-100 text-red-700" :
                  "bg-yellow-100 text-yellow-800"
                }`}>
                  {m.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-stone-500">Court:</span>
                <select
                  className="rounded border border-stone-300 px-2 py-1"
                  value={m.court?.id ?? ""}
                  disabled={m.status === "cancelled"}
                  onChange={(e) => handleAssignCourt(m.id, e.target.value)}
                >
                  <option value="">Court TBD</option>
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <ul className="mt-3 space-y-2 text-sm text-stone-700">
                {m.match_players.map((mp: any) => {
                  const key = `${m.id}_${mp.player_id}`;
                  return (
                    <li key={mp.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[10rem]">
                        {mp.players.first_name} {mp.players.last_name} — <em>{mp.response_status}</em>
                      </span>
                      {m.status === "proposed" && (
                        <>
                          <select
                            className="rounded border border-stone-300 px-2 py-0.5 text-xs"
                            value={swapTarget[key] ?? ""}
                            onChange={(e) => setSwapTarget({ ...swapTarget, [key]: e.target.value })}
                          >
                            <option value="">Swap with...</option>
                            {swapOptions.map((p) => (
                              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                            ))}
                          </select>
                          <button
                            disabled={!swapTarget[key]}
                            onClick={() => handleSwap(m.id, mp.player_id)}
                            className="rounded bg-stone-200 px-2 py-0.5 text-xs disabled:opacity-40"
                          >
                            Swap in
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {matches.length === 0 && <p className="text-stone-500">No matches yet.</p>}
      </div>
    </div>
  );
}
