"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { TeamSummary } from "@/lib/types";
import { getMyTeams } from "@/lib/auth-api";
import { useAuth } from "./AuthContext";

const ACTIVE_TEAM_KEY = "tack_active_team_id";

interface TeamState {
  /** Teams the user belongs to with Tack access. */
  teams: TeamSummary[];
  /** The currently selected team context (null = no filter). */
  activeTeam: TeamSummary | null;
  /** Switch the active team context. */
  setActiveTeam: (team: TeamSummary | null) => void;
  /** true while the initial teams load is in flight. */
  isLoading: boolean;
}

const TeamContext = createContext<TeamState>({
  teams: [],
  activeTeam: null,
  setActiveTeam: () => {},
  isLoading: false,
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeam, setActiveTeamState] = useState<TeamSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setActiveTeam = useCallback((team: TeamSummary | null) => {
    setActiveTeamState(team);
    try {
      if (team) localStorage.setItem(ACTIVE_TEAM_KEY, team.id);
      else localStorage.removeItem(ACTIVE_TEAM_KEY);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!token || !user) {
      setTeams([]);
      setActiveTeamState(null);
      return;
    }
    setIsLoading(true);
    getMyTeams(token)
      .then((myTeams) => {
        // Every team the user belongs to, full stop -- no per-team `tack`
        // product-slug filtering. See auth-api.ts's TeamClaim doc comment.
        setTeams(myTeams);
        // Restore persisted active team, validating it's still in the list.
        try {
          const savedId = localStorage.getItem(ACTIVE_TEAM_KEY);
          if (savedId) {
            const match = myTeams.find((t) => t.id === savedId);
            setActiveTeamState(match ?? null);
            if (!match) localStorage.removeItem(ACTIVE_TEAM_KEY);
          }
        } catch { /* ignore */ }
      })
      .catch((err) => console.error("[TeamContext] load failed:", err))
      .finally(() => setIsLoading(false));
  }, [token, user]);

  return (
    <TeamContext.Provider value={{ teams, activeTeam, setActiveTeam, isLoading }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
