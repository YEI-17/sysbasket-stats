"use client";

import { supabase } from "@/lib/supabaseClient";

export default function SubstitutionPanel({gamePlayers}:{gamePlayers:any[]}){

async function subOut(id:string){

await supabase
.from("game_players")
.update({is_on_court:false})
.eq("id",id);

}

async function subIn(id:string){

await supabase
.from("game_players")
.update({is_on_court:true})
.eq("id",id);

}

return(

<div className="space-y-3">

<h2 className="font-bold">
場上球員
</h2>

{gamePlayers
.filter(p=>p.is_on_court)
.map(p=>(

<div key={p.id} className="flex justify-between">

<span>
#{p.players.number} {p.players.name}
</span>

<button
onClick={()=>subOut(p.id)}
className="bg-red-600 px-3 py-1 rounded"
>
下場
</button>

</div>

))}

<h2 className="font-bold mt-6">
替補
</h2>

{gamePlayers
.filter(p=>!p.is_on_court)
.map(p=>(

<div key={p.id} className="flex justify-between">

<span>
#{p.players.number} {p.players.name}
</span>

<button
onClick={()=>subIn(p.id)}
className="bg-green-600 px-3 py-1 rounded"
>
上場
</button>

</div>

))}

</div>

);
}