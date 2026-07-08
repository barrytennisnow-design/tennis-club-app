import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { match_id, court_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin.from("matches").update({ court_id }).eq("id", match_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
