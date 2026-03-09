"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { requireRecorderOrAdmin } from "@/lib/auth";
import { useRouter } from "next/navigation";

type Player = { id: string; name: string; number: number | null };

const OPPONENT_PLAYER_ID = "58a625c3-cc86-4128-9354-b3f148f88a86"; // 你的對手假球員 UUID（固定那筆）

export default function NewGamePage() {
  const router = useRouter();

  // ✅ 主/客隊名（取代 opponent）
  const [teamA, setTeamA] = useState(""); // 主場（左）
  const [teamB, setTeamB] = useState(""); // 客場（右）

  const [location, setLocation] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  // ✅ 快速新增球員
  const [newNumber, setNewNumber] = useState<string>("");
  const [newName, setNewName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        await requireRecorderOrAdmin();
        const { data, error } = await supabase
          .from("players")
          .select("id,name,number")
          .eq("active", true)
          .order("number", { ascending: true, nullsFirst: false });

        if (error) return setMsg(error.message);

        // ✅ 不把「對手」顯示在可勾選名單（避免誤勾）
        const list = ((data as Player[]) ?? []).filter((p) => p.id !== OPPONENT_PLAYER_ID);

        setPlayers(list);
      } catch (e: any) {
        setMsg(e.message === "NO_PERMISSION" ? "你沒有記錄權限" : "請先登入");
      }
    })();
  }, []);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  // ✅ 新增球員（號碼+名字）到 players 表，並自動勾選本場出賽
  async function addPlayer() {
    setMsg("");

    try {
      await requireRecorderOrAdmin();

      const name = newName.trim();
      if (!name) return setMsg("請輸入球員名字");

      const numStr = newNumber.trim();
      const num = numStr === "" ? null : Number(numStr);
      if (numStr !== "" && Number.isNaN(num)) return setMsg("球衣號碼要是數字");

      const { data, error } = await supabase
        .from("players")
        .insert({ name, number: num, active: true })
        .select("id,name,number")
        .single();

      if (error) return setMsg(error.message);

      // ✅ 加到列表並排序
      setPlayers((prev) => {
        const next = [...prev, data as Player];
        next.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
        return next;
      });

      // ✅ 自動勾選本場出賽
      setSelected((s) => ({ ...s, [(data as Player).id]: true }));

      setNewNumber("");
      setNewName("");
      setMsg("✅ 已新增球員並加入本場出賽名單");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function createGame() {
    setMsg("");
    try {
      await requireRecorderOrAdmin();

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setMsg("請先登入");

      // ✅ 至少要有主/客隊名（不然 live 會顯示 主場/客場 fallback）
      const home = teamA.trim() || "主場";
      const away = teamB.trim() || "客場";

      // ✅ 寫入 games：teamA/teamB（給 live 讀）
      // ⚠️ 你的 games 現在有 game_date/opponent/location... 我保留舊欄位，同時補 teamA/teamB
      const { data: game, error } = await supabase
        .from("games")
        .insert({
          game_date: date,
          location,
          opponent: away, // 保留舊欄位：你之前用 opponent，這裡放客場當「對手」也合理
          quarters: 4,
          status: "scheduled",
          created_by: auth.user.id,

          // ✅ 新欄位（你要先在 DB 加 teamA/teamB）
          teamA: home,
          teamB: away,
        })
        .select("id")
        .single();

      if (error) return setMsg(error.message);

      const gameId = game.id as string;

      const gpRows = Object.entries(selected)
        .filter(([, v]) => v)
        .map(([player_id]) => ({ game_id: gameId, player_id, starter: false, minutes: 0 }));

      if (gpRows.length > 0) {
        const { error: gpErr } = await supabase.from("game_players").insert(gpRows);
        if (gpErr) return setMsg(gpErr.message);
      } else {
        // 你也可以允許沒勾球員直接進 live；我先提醒一下比較合理
        // return setMsg("請至少勾選一位本場出賽球員");
      }

      router.push(`/games/${gameId}/live`);
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    background: "#111",
    color: "white",
  };

  const btnGreen: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "#052e12",
    fontWeight: 900,
    cursor: "pointer",
  };

  const btnGray: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#333",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <main style={{ padding: 20, maxWidth: 720 }}>
      <h2>建立比賽（4節 / 每節10分鐘）</h2>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>日期</label>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={inputStyle} />
        </div>
        <div>
          <label>地點</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* ✅ 主/客隊名（取代「對手」單一欄位） */}
      <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>主場（左邊顯示）</label>
          <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="例如：資工系" style={inputStyle} />
        </div>
        <div>
          <label>客場（右邊顯示）</label>
          <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="例如：電機系" style={inputStyle} />
        </div>
      </div>

      {/* ✅ 快速新增球員 */}
      <h3 style={{ marginTop: 18 }}>快速新增球員（號碼 + 名字）</h3>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="號碼（可留空）"
          inputMode="numeric"
          style={{ ...inputStyle, width: 160 }}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="名字"
          style={{ ...inputStyle, width: 220 }}
        />
        <button onClick={addPlayer} style={btnGreen}>新增到名單</button>
      </div>

      <h3 style={{ marginTop: 18 }}>本場出賽名單（按號碼排序）</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {players.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} />
            <span>#{p.number ?? "-"} {p.name}</span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={createGame} style={btnGreen}>建立並開始記錄</button>
        <button onClick={() => router.push("/")} style={btnGray}>返回</button>
      </div>

      {msg && <p style={{ marginTop: 12, color: "#ddd" }}>{msg}</p>}
    </main>
  );
}