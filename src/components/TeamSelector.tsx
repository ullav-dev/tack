"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTeam } from "@/contexts/TeamContext";
import type { TeamSummary } from "@/lib/types";
import TeamAvatar from "./TeamAvatar";

/**
 * Dropdown for switching between team contexts in the nav.
 * Only shown when the user belongs to more than one team.
 */
export default function TeamSelector() {
  const t = useTranslations("teamSelector");
  const { teams, activeTeam, setActiveTeam } = useTeam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (teams.length < 2) return null;

  function switchToTeam(team: TeamSummary) {
    setActiveTeam(team);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        title={t("switchTeam")}
      >
        {activeTeam ? (
          <TeamAvatar team={activeTeam} size="xs" />
        ) : (
          <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
            ?
          </span>
        )}
        <span className="max-w-[8rem] truncate">
          {activeTeam ? activeTeam.name : t("selectTeam")}
        </span>
        <svg className="w-3 h-3 shrink-0 text-slate-400" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 7L0 2h10L5 7z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50 py-1">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {t("switchTeam")}
          </p>
          {teams.map((team) => (
            <button
              type="button"
              key={team.id}
              onClick={() => switchToTeam(team)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
            >
              <TeamAvatar team={team} size="xs" />
              <span className={`flex-1 truncate ${activeTeam?.id === team.id ? "font-semibold text-rose-700" : "text-slate-700"}`}>
                {team.name}
              </span>
              {activeTeam?.id === team.id && (
                <svg className="shrink-0 w-3.5 h-3.5 text-rose-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
