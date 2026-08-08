"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useNoteEvents } from "@/contexts/NoteEventsContext";
import {
  createNoteFolder,
  deleteNoteFolder,
  listNoteFolders,
  renameNoteFolder,
  type NoteFolder,
} from "@/lib/tack-server-api";
import DeleteNoteFolderModal from "@/components/DeleteNoteFolderModal";

/** What `NotesList` below it is currently scoped to: every note in the team
 * (`"all"`, the original/default behavior), notes with no folder
 * (`"unfiled"`), or one specific folder's notes (its id). */
export type NoteFolderFilter = "all" | "unfiled" | string;

interface Props {
  selected: NoteFolderFilter;
  onSelect: (filter: NoteFolderFilter) => void;
}

/** Create/rename/delete UI for a team's Notes folders, plus the "All notes"
 * / "Unfiled" / per-folder selector that scopes `NotesList` underneath it
 * (see Navigator.tsx). Mirrors the Spaces section's own create pattern
 * (inline input, Enter/Escape/blur-on-empty) and PageTree's hover-reveal
 * icon-button pattern for per-row actions -- deliberately flat (no nesting),
 * matching `note_folders`' own flat schema. */
export default function NoteFolderList({ selected, onSelect }: Props) {
  const { token } = useAuth();
  const { activeTeam } = useTeam();
  const { subscribe, subscribeDeleted } = useNoteEvents();
  const t = useTranslations("navigator");

  const [folders, setFolders] = useState<NoteFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever a note's folder might have changed elsewhere (moved via
  // NoteThread, or deleted outright) -- re-fetches so `note_count` badges
  // stay accurate without polling. A patch lacking `folder_id` still bumps
  // this (harmless extra fetch) since NoteEventsContext's patch shape is
  // generic and doesn't tell us which fields actually changed.
  const [refreshTick, setRefreshTick] = useState(0);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deletingFolder, setDeletingFolder] = useState<NoteFolder | null>(null);

  useEffect(() => {
    if (!token || !activeTeam) {
      setFolders(null);
      return;
    }
    let cancelled = false;
    listNoteFolders(token, activeTeam.id)
      .then((f) => {
        if (!cancelled) setFolders(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTeam, refreshTick]);

  useEffect(() => {
    const unsubUpdate = subscribe((_noteId, patch) => {
      if ("folder_id" in patch) setRefreshTick((n) => n + 1);
    });
    const unsubDelete = subscribeDeleted(() => setRefreshTick((n) => n + 1));
    return () => {
      unsubUpdate();
      unsubDelete();
    };
  }, [subscribe, subscribeDeleted]);

  async function handleCreate() {
    const name = newName.trim();
    if (!token || !activeTeam || !name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const folder = await createNoteFolder(token, { team_id: activeTeam.id, name });
      setFolders((prev) => [...(prev ?? []), folder]);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startRename(folder: NoteFolder) {
    setRenamingId(folder.id);
    setRenameDraft(folder.name);
  }

  async function handleRename(folder: NoteFolder) {
    const name = renameDraft.trim();
    if (!token || !name || renaming) return;
    if (name === folder.name) {
      setRenamingId(null);
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      const updated = await renameNoteFolder(token, folder.id, name);
      setFolders((prev) => prev?.map((f) => (f.id === updated.id ? updated : f)) ?? prev);
      setRenamingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete(folder: NoteFolder) {
    if (!token) return;
    await deleteNoteFolder(token, folder.id);
    setFolders((prev) => prev?.filter((f) => f.id !== folder.id) ?? prev);
    if (selected === folder.id) onSelect("all");
    setDeletingFolder(null);
  }

  if (!activeTeam) return null;

  return (
    <div>
      {error && <p className="px-2 py-1 text-xs text-red-600">{error}</p>}
      {!folders && !error && <p className="px-2 py-1 text-xs text-slate-400">{t("loading")}</p>}

      <FolderRow
        label={t("allNotes")}
        isSelected={selected === "all"}
        onClick={() => onSelect("all")}
      />
      <FolderRow
        label={t("unfiled")}
        isSelected={selected === "unfiled"}
        onClick={() => onSelect("unfiled")}
      />

      {folders?.map((folder) =>
        renamingId === folder.id ? (
          <div key={folder.id} className="px-2 py-1">
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(folder);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onBlur={() => handleRename(folder)}
              disabled={renaming}
              className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
            />
          </div>
        ) : (
          <FolderRow
            key={folder.id}
            label={folder.name}
            count={folder.note_count}
            isSelected={selected === folder.id}
            onClick={() => onSelect(folder.id)}
            onRename={() => startRename(folder)}
            onDelete={() => setDeletingFolder(folder)}
          />
        )
      )}

      {creating && (
        <div className="px-2 py-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            onBlur={() => {
              if (!newName.trim()) setCreating(false);
            }}
            disabled={saving}
            placeholder={t("newFolderName")}
            className="w-full text-sm rounded border border-slate-200 px-1.5 py-0.5 focus:border-rose-400 focus:outline-none"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="w-full text-left px-2.5 py-1 text-xs font-medium text-rose-700 hover:underline"
      >
        + {t("newFolder")}
      </button>

      {deletingFolder && (
        <DeleteNoteFolderModal
          folderName={deletingFolder.name}
          noteCount={deletingFolder.note_count}
          onConfirm={() => handleDelete(deletingFolder)}
          onCancel={() => setDeletingFolder(null)}
        />
      )}
    </div>
  );
}

interface FolderRowProps {
  label: string;
  count?: number;
  isSelected: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderRow({ label, count, isSelected, onClick, onRename, onDelete }: FolderRowProps) {
  const t = useTranslations("navigator");
  return (
    <div
      className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${
        isSelected ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <button type="button" onClick={onClick} className="flex-1 min-w-0 truncate text-left">
        {label}
        {count !== undefined && <span className="ml-1 text-xs text-slate-400">({count})</span>}
      </button>
      {onRename && (
        <button
          type="button"
          onClick={onRename}
          aria-label={t("renameFolder")}
          className="shrink-0 w-4 text-xs text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600"
        >
          ✎
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("deleteFolder")}
          className="shrink-0 w-4 text-xs text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
        >
          ×
        </button>
      )}
    </div>
  );
}
