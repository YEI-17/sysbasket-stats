"use client";

export default function Scoreboard({
home,
away,
teamA,
teamB
}:{
home:number
away:number
teamA:string
teamB:string
}){

return(

<div className="bg-black text-white p-6 rounded-xl text-center">

<div className="text-sm text-gray-400">
比分
</div>

<div className="text-4xl font-bold mt-2">

{home} : {away}

</div>

<div className="text-sm mt-2">

{teamA} vs {teamB}

</div>

</div>

);
}