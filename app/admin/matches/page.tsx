"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function isoDaysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

export default function AdminMatchesPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDaysFromNow(0));
  const [endDate, setEndDate] = useState(isoDaysFromNow(7));

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(name), match_players(response_status, players(first_name, last_name))")
      .order("match_date", { ascending: true });
    setMatches(data ?? []);
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
        {matches.map((m) => (
          <div key={m.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {m.match_date} · {m.time_slot} · {m.court?.name ?? "Court TBD"}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                m.status === "confirmed" ? "bg-green-100 text-green-800" :
                m.status === "cancelled" ? "bg-red-100 text-red-700" :
                "bg-yellow-100 text-yellow-800"
              }`}>
                {m.status.toUpperCase()}
              </span>
            </div>
            <ul className="mt-2 text-sm text-stone-600">
              {m.match_players.map((mp: any, i: number) => (
                <li key={i}>
                  {mp.players.first_name} {mp.players.last_name} — {mp.response_status}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {matches.length === 0 && <p className="text-stone-500">No matches yet.</p>}
      </div>
    </div>
  );
}
