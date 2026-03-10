"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Player = {
  id: string;
  name: string;
  number: number | null;
};

export default function StartersPage() {

  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {

    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("status","live")
      .limit(1)
      .single();

    if(!game) return;

    setGameId(game.id);

    const { data: players } = await supabase
      .from("players")
      .select("*")
      .order("number");

    setPlayers(players || []);
  }

  function togglePlayer(id:string){

    if(selected.includes(id)){
      setSelected(selected.filter(p=>p!==id));
    }else{

      if(selected.length >=5){
        alert("先發只能5人");
        return;
      }

      setSelected([...selected,id]);
    }
  }

  async function saveStarters(){

    if(!gameId) return;

    for(const pid of selected){

      await supabase
      .from("game_players")
      .insert({
        game_id:gameId,
        player_id:pid,
        team_side:"home",
        is_starter:true,
        is_on_court:true
      });

    }

    alert("先發設定完成");
  }

  return(

    <div className="p-6 text-white">

      <h1 className="text-xl font-bold mb-4">
      設定先發五人
      </h1>

      <div className="grid grid-cols-3 gap-3">

        {players.map(p=>(

          <button
          key={p.id}
          onClick={()=>togglePlayer(p.id)}
          className={`p-3 rounded-lg ${
            selected.includes(p.id)
            ? "bg-green-600"
            : "bg-neutral-800"
          }`}
          >

            #{p.number} {p.name}

          </button>

        ))}

      </div>

      <button
      onClick={saveStarters}
      className="mt-6 bg-blue-600 px-6 py-3 rounded-lg"
      >
      儲存先發
      </button>

    </div>

  );
}