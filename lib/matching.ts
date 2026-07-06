// Core match-making algorithm.
//
// For each day in the given date range:
//   1. Find active players available that day/time who are not
//      already tied up in a proposed/confirmed match that day.
//   2. Sort them by ranking (so groups are skill-balanced).
//   3. Chunk into groups of 4. Leftover 1-3 players roll over
//      and are simply not matched that day (manager can manually
//      pair them, or they'll be included again next run).
//   4. Assign each group of 4 to a court on a rotating basis.
//   5. Insert a `matches` row (status=proposed) + 4 `match_players`
//      rows (status=proposed) per group, and email each player.
//
// This intentionally mirrors the old "Match Matrix" spreadsheet's
// behavior (4-per-match, PROPOSED status, court assignment) while
// replacing the manual spreadsheet copy/paste with a real query.

import { sendEmail, matchProposedEmail } from "./email";

export interface GenerateMatchesParams {
  supabaseAdmin: any;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export async function generateMatches({ supabaseAdmin, startDate, endDate }: GenerateMatchesParams) {
  const { data: courts } = await supabaseAdmin.from("courts").select("*").order("name");
  const courtList = courts && courts.length > 0 ? courts : [{ id: null, name: "Court TBD" }];

  const { data: availabilityRows } = await supabaseAdmin
    .from("availability")
    .select("player_id, date, time_slot, players!inner(id, first_name, last_name, email, ranking, status)")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("players.status", "active");

  const { data: lockedRows } = await supabaseAdmin
    .from("locked_availability")
    .select("player_id, date, time_slot");

  const lockedSet = new Set((lockedRows ?? []).map((r: any) => `${r.player_id}_${r.date}_${r.time_slot}`));

  // group by date_timeslot
  const byDay: Record<string, any[]> = {};
  for (const row of availabilityRows ?? []) {
    const key = `${row.date}_${row.time_slot}`;
    if (lockedSet.has(`${row.player_id}_${row.date}_${row.time_slot}`)) continue;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
  }

  const results: { date: string; time_slot: string; matchesCreated: number }[] = [];
  let courtCursor = 0;

  for (const key of Object.keys(byDay)) {
    const [date, time_slot] = key.split("_");
    const players = byDay[key]
      .slice()
      .sort((a, b) => (a.players.ranking ?? 0) - (b.players.ranking ?? 0));

    let created = 0;
    for (let i = 0; i + 4 <= players.length; i += 4) {
      const group = players.slice(i, i + 4);
      const court = courtList[courtCursor % courtList.length];
      courtCursor++;

      const { data: match, error: matchError } = await supabaseAdmin
        .from("matches")
        .insert({
          match_date: date,
          time_slot,
          court_id: court.id,
          status: "proposed",
        })
        .select()
        .single();

      if (matchError || !match) continue;

      await supabaseAdmin.from("match_players").insert(
        group.map((g) => ({
          match_id: match.id,
          player_id: g.player_id,
          response_status: "proposed",
        }))
      );

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
      for (const g of group) {
        const teammates = group
          .filter((other) => other.player_id !== g.player_id)
          .map((other) => `${other.players.first_name} ${other.players.last_name}`);

        const { subject, html } = matchProposedEmail({
          firstName: g.players.first_name,
          matchDate: date,
          timeSlot: time_slot,
          courtName: court.name,
          teammates,
          acceptUrl: `${siteUrl}/matches`,
        });

        await sendEmail({ supabaseAdmin, to: g.players.email, subject, html });
      }

      created++;
    }
    if (created > 0) results.push({ date, time_slot, matchesCreated: created });
  }

  return results;
}
