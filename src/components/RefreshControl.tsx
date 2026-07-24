"use client";

import { useState, useCallback } from "react";
import { useInterval } from "@/hooks/useInterval";

const DEFAULT_STORAGE_KEY = "tack_refresh_interval";
const DEFAULT_INTERVAL_SECS = 30;

export const DEFAULT_REFRESH_INTERVALS = [
  { label: "Off", secs: 0 },
  { label: "30 sec", secs: 30 },
  { label: "1 min", secs: 60 },
  { label: "5 min", secs: 300 },
  { label: "10 min", secs: 600 },
  { label: "30 min", secs: 1800 },
];

interface Props {
  onRefresh: () => Promise<void>;
  /** localStorage key for the persisted interval — pass a distinct key per panel. */
  storageKey?: string;
  intervals?: { label: string; secs: number }[];
}

/** Same auto-refresh convention used across the Ullav suite (togra/lagan
 * both have their own copy of this exact component) — a persisted interval
 * `<select>` plus a manual "refresh now" button, not a Tack-specific
 * pattern. Notes have no live/push update mechanism (unlike Pages'
 * Hocuspocus sync), so this is how a user sees replies/edits made by
 * someone else without a full page reload. */
export default function RefreshControl({ onRefresh, storageKey = DEFAULT_STORAGE_KEY, intervals = DEFAULT_REFRESH_INTERVALS }: Props) {
  const [intervalSecs, setIntervalSecs] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_INTERVAL_SECS;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? Number(stored) : DEFAULT_INTERVAL_SECS;
  });
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  useInterval(() => {
    if (document.hidden) return;
    void doRefresh();
  }, intervalSecs === 0 ? null : intervalSecs * 1000);

  function handleIntervalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value);
    setIntervalSecs(next);
    localStorage.setItem(storageKey, String(next));
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <select
        value={intervalSecs}
        onChange={handleIntervalChange}
        title="Auto-refresh interval"
        className="text-xs text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-rose-400 cursor-pointer"
      >
        {intervals.map(({ label, secs }) => (
          <option key={secs} value={secs}>{label}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={doRefresh}
        disabled={refreshing}
        title="Refresh now"
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-700 transition-colors disabled:opacity-40"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}>
          <path d="M1.705 8a6.3 6.3 0 0 1 6.3-6.3 6.3 6.3 0 0 1 4.45 1.845L10.5 5.5H14V2l-1.42 1.42A7.8 7.8 0 0 0 8 1.2 6.8 6.8 0 1 0 14.8 8h-1.5A5.3 5.3 0 1 1 8 2.7 5.3 5.3 0 0 1 8 2.7" />
        </svg>
      </button>
    </div>
  );
}
