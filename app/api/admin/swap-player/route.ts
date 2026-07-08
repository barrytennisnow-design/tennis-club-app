// Swaps a player out of a still-PROPOSED match for a different
// player (e.g. an injury, a scheduling conflict, or just testing).
// The new player starts fresh at response_status='proposed'; the
// old player's row is removed from this match entirely.
//
// Only allowed while the match is still 'proposed' -- once
// confirmed or cancelled, use "Generate Matches" again instead.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { match_id, old_player_id, new_player_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("*, court:courts(name)")
    .eq("id", match_id)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "proposed") {
    return NextResponse.json({ error: "Can only swap players on a still-proposed match" }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("match_players")
    .delete()
    .eq("match_id", match_id)
    .eq("player_id", old_player_id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: insertError } = await admin
    .from("match_players")
    .insert({ match_id, player_id: new_player_id, response_status: "proposed" });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Notify the newly-added player.
  const { data: allMatchPlayers } = await admin
    .from("match_players")
    .select("players(first_name, last_name, email)")
    .eq("match_id", match_id);

  const newPlayer = (allMatchPlayers ?? []).find(
    (mp: any) => true // we'll just find by re-querying below for clarity
  );
  const { data: newPlayerRow } = await admin.from("players").select("first_name, email").eq("id", new_player_id).single();

  if (newPlayerRow) {
    const teammates = (allMatchPlayers ?? [])
      .map((mp: any) => `${mp.players.first_name} ${mp.players.last_name}`)
      .filter((name: string) => name !== `${newPlayerRow.first_name}`); // best-effort

    const { subject, html } = matchProposedEmail({
      firstName: newPlayerRow.first_name,
      matchDate: match.match_date,
      timeSlot: match.time_slot,
      courtName: match.court?.name ?? "Court TBD",
      teammates,
      acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/matches`,
    });
    await sendEmail({ supabaseAdmin: admin, to: newPlayerRow.email, subject, html });
  }

  return NextResponse.json({ ok: true });
}
