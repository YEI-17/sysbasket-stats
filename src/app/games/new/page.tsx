"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NewGamePage() {

  const router = useRouter();

  const [opponent,setOpponent] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);

  async function createGame(){

    setLoading(true);
    setError("");

    try{

      // 關閉舊的 live 比賽
      const {error:closeError} = await supabase
      .from("games")
      .update({status:"finished"})   // ⭐ 修正
      .eq("status","live");

      if(closeError){
        setError("關閉舊比賽失敗："+closeError.message);
        setLoading(false);
        return;
      }

      // 建立新比賽
      const {data:game,error:gameError} = await supabase
      .from("games")
      .insert({
        teamA:"我們",
        teamB:opponent || "對手",
        status:"live",
        home_score:0,
        away_score:0
      })
      .select()
      .single();

      if(gameError){
        setError("建立比賽失敗："+gameError.message);
        setLoading(false);
        return;
      }

      // 建立第一節時間
      const {error:clockError} = await supabase
      .from("game_clock")
      .insert({
        game_id:game.id,
        quarter:1,
        seconds_left:600,
        is_running:false
      });

      if(clockError){
        setError("建立時間失敗："+clockError.message);
        setLoading(false);
        return;
      }

      router.push("/games/live");

    }catch(err:any){
      setError(err.message);
    }

    setLoading(false);
  }

  return(

    <div className="p-6 text-white">

      <h1 className="text-xl font-bold mb-4">
      建立新比賽
      </h1>

      <input
      value={opponent}
      onChange={(e)=>setOpponent(e.target.value)}
      placeholder="輸入對手"
      className="bg-neutral-800 p-3 rounded-lg"
      />

      <button
      onClick={createGame}
      className="bg-green-600 px-6 py-3 rounded-lg ml-4"
      >
      建立
      </button>

      {error && (
        <div className="text-red-400 mt-4">
        {error}
        </div>
      )}

    </div>

  );
}