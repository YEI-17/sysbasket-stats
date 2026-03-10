"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Game = {
  id: string
  teamA: string
  teamB: string
  home_score: number
  away_score: number
}

export default function LivePage(){

  const [game,setGame] = useState<Game | null>(null)
  const [error,setError] = useState("")
  const [loading,setLoading] = useState(true)

  useEffect(()=>{
    loadGame()
  },[])

  async function loadGame(){

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, home_score, away_score")
      .eq("status","live")
      .limit(1)

    if(error){
      setError("讀取目前比賽失敗："+error.message)
      setLoading(false)
      return
    }

    if(!data || data.length === 0){
      setError("目前沒有 live 比賽")
      setLoading(false)
      return
    }

    setGame(data[0])
    setLoading(false)
  }

  if(loading){
    return(
      <div className="p-6 text-white">
        讀取比賽中...
      </div>
    )
  }

  if(error){
    return(
      <div className="p-6 text-red-400">
        {error}
      </div>
    )
  }

  return(

    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">

      <div className="text-center">

        <h1 className="text-3xl font-bold mb-6">
          {game?.teamA} vs {game?.teamB}
        </h1>

        <div className="text-6xl font-bold">
          {game?.home_score} : {game?.away_score}
        </div>

      </div>

    </div>

  )
}