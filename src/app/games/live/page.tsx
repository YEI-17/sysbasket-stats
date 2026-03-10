"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GameLite = {
  id: string;
  status: string;
  game_date: string;
  teamA: string | null;
  teamB: string | null;
};

export default function LiveEntryPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("正在尋找比賽...");

  useEffect(() => {
    async function go() {
      try {
        const liveRes = await supabase
          .from("games")
          .select('id, status, game_date, "teamA", "teamB"')
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(1);

        const liveGame = liveRes.data?.[0] as GameLite | undefined;
        if (liveGame?.id) {
          router.replace(`/games/${liveGame.id}/live`);
          return;
        }

        const scheduledRes = await supabase
          .from("games")
          .select('id, status, game_date, "teamA", "teamB"')
          .eq("status", "scheduled")
          .order("created_at", { ascending: false })
          .limit(1);

        const scheduledGame = scheduledRes.data?.[0] as GameLite | undefined;
        if (scheduledGame?.id) {
          router.replace(`/games/${scheduledGame.id}/live`);
          return;
        }

        const latestRes = await supabase
          .from("games")
          .select('id, status, game_date, "teamA", "teamB"')
          .order("created_at", { ascending: false })
          .limit(1);

        const latestGame = latestRes.data?.[0] as GameLite | undefined;
        if (latestGame?.id) {
          router.replace(`/games/${latestGame.id}/live`);
          return;
        }

        setMsg("目前沒有任何比賽，先到新增比賽頁建立一場。");
      } catch (err: any) {
        setMsg(err.message || "讀取目前比賽失敗");
      }
    }

    go();
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        {msg}
      </div>
    </main>
  );
}
