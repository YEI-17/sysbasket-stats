"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { supabase } from "@/lib/supabaseClient";

type UserSessionRow = {
  id: string;
  viewer_name: string | null;
  role: string;
  login_at: string;
  logout_at: string | null;
  last_seen_at: string;
  is_online: boolean;
};

function formatTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function isActuallyOnline(session: UserSessionRow) {
  if (!session.is_online) return false;
  if (!session.last_seen_at) return false;

  const diff = Date.now() - new Date(session.last_seen_at).getTime();
  return diff <= 30000;
}

export default function StaffHomePage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<UserSessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [sessionMsg, setSessionMsg] = useState("");

  const updateMyHeartbeat = useCallback(async () => {
    if (typeof window === "undefined") return;

    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        is_online: true,
      })
      .eq("id", sessionId);
  }, []);

  const markMySessionOffline = useCallback(async () => {
    if (typeof window === "undefined") return;

    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        is_online: false,
      })
      .eq("id", sessionId);
  }, []);

  const fetchSessions = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoadingSessions(true);
    } else {
      setRefreshingSessions(true);
    }

    setSessionMsg("");

    const { data, error } = await supabase
      .from("user_sessions")
      .select("id, viewer_name, role, login_at, logout_at, last_seen_at, is_online")
      .order("login_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error(error);
      setSessionMsg("讀取在線名單失敗");

      if (showLoading) {
        setLoadingSessions(false);
      } else {
        setRefreshingSessions(false);
      }
      return;
    }

    setSessions((data as UserSessionRow[]) || []);

    if (showLoading) {
      setLoadingSessions(false);
    } else {
      setRefreshingSessions(false);
    }
  }, []);

  useEffect(() => {
    void updateMyHeartbeat();
    void fetchSessions(true);
  }, [fetchSessions, updateMyHeartbeat]);

  useEffect(() => {
    const heartbeatTimer = setInterval(() => {
      void updateMyHeartbeat();
    }, 20000);

    const sessionListTimer = setInterval(() => {
      void fetchSessions(false);
    }, 15000);

    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(sessionListTimer);
    };
  }, [fetchSessions, updateMyHeartbeat]);

  useEffect(() => {
    const handlePageHide = () => {
      void markMySessionOffline();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void markMySessionOffline();
      } else if (document.visibilityState === "visible") {
        void updateMyHeartbeat();
        void fetchSessions(false);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchSessions, markMySessionOffline, updateMyHeartbeat]);

  const viewerSessions = useMemo(() => {
    return sessions.filter((session) => session.role === "viewer");
  }, [sessions]);

  const onlineViewerSessions = useMemo(() => {
    return viewerSessions.filter((session) => isActuallyOnline(session));
  }, [viewerSessions]);

  const offlineViewerSessions = useMemo(() => {
    return viewerSessions.filter((session) => !isActuallyOnline(session));
  }, [viewerSessions]);

  async function handleRefreshSessions() {
    await updateMyHeartbeat();
    await fetchSessions(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(255,140,0,0.08) 0%, rgba(255,255,255,0.03) 10%, #000000 30%, #000000 100%)",
        color: "#fff",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <div
          style={{
            background: "rgba(10, 10, 10, 0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 28,
            boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#d4d4d8",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  marginBottom: 14,
                }}
              >
                STAFF DASHBOARD
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#ffffff",
                }}
              >
                工作人員後台
              </h1>

              <p
                style={{
                  color: "#a1a1aa",
                  marginTop: 10,
                  marginBottom: 0,
                  fontSize: 15,
                  lineHeight: 1.7,
                  maxWidth: 620,
                }}
              >
                從這裡快速進入建立比賽、比賽管理與完整數據頁面，也能查看目前觀眾在線狀態。
              </p>
            </div>

            <LogoutButton />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/new")}
          >
            <div style={cardTagStyle}>CREATE</div>
            <div style={cardTitleStyle}>建立新比賽</div>
            <div style={cardDescStyle}>
              建立新的賽事，設定對戰資訊並開始後續紀錄流程。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>

          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/list")}
          >
            <div style={cardTagStyle}>GAMES</div>
            <div style={cardTitleStyle}>進入比賽列表</div>
            <div style={cardDescStyle}>
              查看目前所有比賽，進入即時記錄、觀眾頁與單場數據頁。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>

          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/box")}
          >
            <div style={cardTagStyle}>STATS</div>
            <div style={cardTitleStyle}>完整數據頁面</div>
            <div style={cardDescStyle}>
              查看整體球隊資料、球員數據與後續延伸統計內容。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>
        </div>

        <section
          style={{
            background: "rgba(10, 10, 10, 0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 24,
            boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
            display: "grid",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#d4d4d8",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                VIEWER STATUS
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: -0.4,
                }}
              >
                在線觀眾監控
              </h2>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#a1a1aa",
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                可查看目前在線觀眾、最後在線時間與是否已正式登出。
              </p>
            </div>

            <button
              onClick={() => void handleRefreshSessions()}
              disabled={refreshingSessions}
              style={{
                border: "none",
                borderRadius: 16,
                padding: "12px 16px",
                cursor: refreshingSessions ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 1,
                color: "#fff",
                opacity: refreshingSessions ? 0.7 : 1,
                background:
                  "linear-gradient(135deg, #ffb347 0%, #f48c06 55%, #d96a00 100%)",
                boxShadow: "0 16px 30px rgba(244, 140, 6, 0.24)",
              }}
            >
              {refreshingSessions ? "刷新中..." : "REFRESH"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>總觀眾 Session</div>
              <div style={summaryValueStyle}>{viewerSessions.length}</div>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>目前在線</div>
              <div style={{ ...summaryValueStyle, color: "#86efac" }}>
                {onlineViewerSessions.length}
              </div>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>目前離線</div>
              <div style={{ ...summaryValueStyle, color: "#fca5a5" }}>
                {offlineViewerSessions.length}
              </div>
            </div>
          </div>

          {loadingSessions ? (
            <div style={infoCardStyle}>讀取在線名單中...</div>
          ) : sessionMsg ? (
            <div style={errorCardStyle}>{sessionMsg}</div>
          ) : viewerSessions.length === 0 ? (
            <div style={infoCardStyle}>目前沒有觀眾登入紀錄</div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              {viewerSessions.map((session, index) => {
                const online = isActuallyOnline(session);

                return (
                  <div
                    key={session.id}
                    style={{
                      borderRadius: 22,
                      padding: 18,
                      border: online
                        ? "1px solid rgba(34,197,94,0.22)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: online
                        ? "linear-gradient(180deg, rgba(16,26,18,0.96) 0%, rgba(9,14,10,0.98) 100%)"
                        : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(7,7,7,0.98) 100%)",
                      boxShadow: online
                        ? "0 16px 32px rgba(0,0,0,0.35), 0 0 20px rgba(34,197,94,0.08)"
                        : "0 16px 32px rgba(0,0,0,0.28)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              color: "rgba(255, 210, 160, 0.42)",
                              fontSize: 12,
                              fontWeight: 900,
                              letterSpacing: 1.5,
                            }}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </div>

                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 900,
                              color: "#fff",
                              letterSpacing: -0.3,
                            }}
                          >
                            {session.viewer_name || "未命名觀眾"}
                          </div>
                        </div>

                        <div
                          style={{
                            color: "#a1a1aa",
                            fontSize: 14,
                            lineHeight: 1.8,
                            display: "grid",
                            gap: 2,
                          }}
                        >
                          <div>登入時間：{formatTime(session.login_at)}</div>
                          <div>最後在線：{formatTime(session.last_seen_at)}</div>
                          <div>登出時間：{formatTime(session.logout_at)}</div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                          background: online
                            ? "rgba(34, 197, 94, 0.16)"
                            : session.logout_at
                            ? "rgba(239, 68, 68, 0.16)"
                            : "rgba(245, 158, 11, 0.16)",
                          border: online
                            ? "1px solid rgba(34, 197, 94, 0.3)"
                            : session.logout_at
                            ? "1px solid rgba(239, 68, 68, 0.28)"
                            : "1px solid rgba(245, 158, 11, 0.28)",
                          color: online
                            ? "#dcfce7"
                            : session.logout_at
                            ? "#fecaca"
                            : "#fde68a",
                        }}
                      >
                        {online ? "在線中" : session.logout_at ? "已登出" : "離線中"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const featureCardStyle: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(7,7,7,0.98) 100%)",
  color: "white",
  cursor: "pointer",
  boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
  display: "grid",
  gap: 12,
};

const cardTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d4d4d8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: "#ffffff",
};

const cardDescStyle: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 14,
  lineHeight: 1.7,
  minHeight: 72,
};

const cardActionStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 800,
};

const summaryCardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(7,7,7,0.98) 100%)",
  boxShadow: "0 14px 30px rgba(0,0,0,0.25)",
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 10,
};

const summaryValueStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: -0.5,
};

const infoCardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(16,16,18,0.95)",
  color: "#d4d4d8",
};

const errorCardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(127, 29, 29, 0.2)",
  border: "1px solid rgba(248, 113, 113, 0.22)",
  color: "#fecaca",
};