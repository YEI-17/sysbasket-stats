"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Game = {
  id:string
  teamA:string
  teamB:string
}

export default function LivePage(){

  const [game,setGame] = useState<Game | null>(null)
  const [error,setError] = useState("")

  useEffect(()=>{
    loadGame()
  },[])

  async function loadGame(){

    const {data,error} = await supabase
    .from("games")
    .select("id,teamA,teamB,status")
    .eq("status","live")
    .limit(1)

    if(error){
      setError("讀取目前比賽失敗："+error.message)
      return
    }

    if(!data || data.length === 0){
      setError("目前沒有 live 比賽")
      return
    }

    setGame(data[0])
  }

  if(error){
    return(
      <div className="text-red-400 p-6">
        {error}
      </div>
    )
  }

  if(!game){
    return(
      <div className="text-white p-6">
        讀取比賽中...
      </div>
    )
  }

  return(

    <div className="p-6 text-white">

      <h1 className="text-2xl font-bold">
      {game.teamA} vs {game.teamB}
      </h1>

      <p className="mt-4">
      比賽ID：{game.id}
      </p>

    </div>

  )

}