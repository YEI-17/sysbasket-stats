"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Game = {
  id: string
  teamA: string
  teamB: string
  status: string
}

export default function LivePage(){

  const [game,setGame] = useState<Game | null>(null)
  const [error,setError] = useState("")
  const [loading,setLoading] = useState(true)

  useEffect(()=>{
    loadGame()
  },[])

  async function loadGame(){

    setLoading(true)

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status")
      .eq("status","live")
      .limit(1)

    if(error){
      console.error(error)
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

    <div className="p-6 text-white">

      <h1 className="text-2xl font-bold">
        {game?.teamA} vs {game?.teamB}
      </h1>

      <p className="mt-4">
        比賽ID：{game?.id}
      </p>

    </div>

  )
}