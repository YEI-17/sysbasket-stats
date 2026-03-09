"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter(); // ✅ 放在最外層

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function signIn() {
    setMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("登入成功 ✅");

    router.push("/games/new"); // ✅ 登入成功跳轉
  }

  async function signUp() {
    setMsg("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    // 建立 profile
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        display_name: email.split("@")[0],
        role: "viewer",
      });
    }

    setMsg("註冊成功 ✅（請找管理員幫你升權限）");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMsg("已登出");
  }

  return (
    <main style={{ padding: 20, maxWidth: 420 }}>
      <h2>登入 / 註冊</h2>

      <label>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 16 }}
      />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={signIn}>登入</button>
        <button onClick={signUp}>註冊</button>
        <button onClick={signOut}>登出</button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}