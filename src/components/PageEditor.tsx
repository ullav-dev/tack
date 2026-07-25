"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { useAuth } from "@/contexts/AuthContext";
import { usePageEvents } from "@/contexts/PageEventsContext";
import type { AuthUser } from "@/lib/auth-api";
import { getPage, getPagePermission, updatePage, type Page, type PermissionLevel } from "@/lib/tack-server-api";
import { displayName } from "@/lib/user-display";
import EditorToolbar from "@/components/EditorToolbar";
import DamAssetNode from "@/tiptap/DamAssetNode";

const HOCUSPOCUS_URL = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? "ws://localhost:8088";

// A small fixed palette rather than random colors, so a given user's
// cursor/presence color is at least stable across a session (same user id
// always hashes to the same slot) without needing the server to assign one.
const PRESENCE_COLORS = ["#be123c", "#0369a1", "#15803d", "#a16207", "#7e22ce", "#c2410c"];

function colorForUserId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

interface PresenceEntry {
  name: string;
  color: string;
}

/** Real-time collaborative Page editor: TipTap bound to a Yjs document
 * synced through tack-hocuspocus. There is deliberately no Save button —
 * edits sync and persist live (see the "Syncing…"/"All changes saved"
 * indicator below); `title` is the one field still saved explicitly
 * through the plain REST API (`PATCH /pages/:id`), since it isn't part of
 * the Yjs document.
 *
 * The `GET /pages/:id/permission` fetch below only drives this component's
 * own UI (disabling typing, showing a "View only" badge) — it is not the
 * security boundary. tack-hocuspocus independently enforces view/edit
 * access itself server-side (see its `onAuthenticate` hook), already
 * verified to silently reject a view-only user's writes even if this
 * client-side gate were bypassed. */
export default function PageEditor() {
  const { pageId } = useParams<{ pageId: string }>();
  const { token, user } = useAuth();
  const { notifyPageUpdated } = usePageEvents();
  const t = useTranslations("editor");

  const [page, setPage] = useState<Page | null>(null);
  const [level, setLevel] = useState<PermissionLevel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);

  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) ydocRef.current = new Y.Doc();
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getPage(token, pageId), getPagePermission(token, pageId)])
      .then(([p, perm]) => {
        if (cancelled) return;
        setPage(p);
        setTitleDraft(p.title);
        setLevel(perm.level);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, pageId]);

  useEffect(() => {
    if (!token) return;
    setSynced(false);
    const provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: pageId,
      token,
      document: ydocRef.current!,
      onSynced: () => setSynced(true),
      onAuthenticationFailed: ({ reason }: { reason: string }) => setLoadError(reason),
    });
    providerRef.current = provider;

    if (user) {
      provider.setAwarenessField("user", { name: displayName(user), color: colorForUserId(user.id) });
    }

    function updatePresence() {
      const states = Array.from(provider.awareness?.getStates().values() ?? []) as { user?: PresenceEntry }[];
      // Require a real `name` string, not just a truthy `user` object --
      // an awareness state can carry `{ user: { name: null, color: null } }`
      // transiently (e.g. before CollaborationCaret has set its own user
      // info), and a plain `Boolean(u)` check doesn't catch that.
      setPresence(states.map((s) => s.user).filter((u): u is PresenceEntry => Boolean(u?.name)));
    }
    provider.awareness?.on("change", updatePresence);
    updatePresence();

    return () => {
      provider.awareness?.off("change", updatePresence);
      provider.destroy();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pageId]);

  async function saveTitle() {
    if (!token || !page || titleDraft.trim() === "" || titleDraft === page.title) return;
    setTitleSaving(true);
    try {
      const updated = await updatePage(token, page.id, { title: titleDraft.trim() });
      setPage(updated);
      notifyPageUpdated(updated.id, { title: updated.title });
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setTitleSaving(false);
    }
  }

  if (loadError) return <p className="p-6 text-red-600">{loadError}</p>;
  if (!page || level === null) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  const editable = level === "edit";

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 px-6 py-3 flex items-center gap-3 shrink-0 print:hidden">
        {editable ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={titleSaving}
            className="text-xl font-semibold text-slate-800 flex-1 min-w-0 rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        ) : (
          <h1 className="text-xl font-semibold text-slate-800 flex-1 min-w-0 truncate">{page.title}</h1>
        )}

        {level === "view" && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {t("viewOnly")}
          </span>
        )}

        {presence.length > 0 && (
          <div className="flex -space-x-1.5 shrink-0" title={presence.map((p) => p.name).join(", ")}>
            {presence.slice(0, 5).map((p, i) => (
              <span
                key={i}
                className="w-6 h-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white select-none"
                style={{ backgroundColor: p.color }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        )}

        <span className="shrink-0 text-xs text-slate-400">{synced ? t("allChangesSaved") : t("syncing")}</span>
      </div>

      {/* print:hidden's header above never shows in print output -- this is
          what actually appears instead (a plain heading, not the input/badges). */}
      <h1 className="hidden print:block px-6 pt-4 text-xl font-semibold text-slate-800">{page.title}</h1>

      {synced ? (
        <PageEditorContent ydoc={ydocRef.current!} provider={providerRef.current!} editable={editable} user={user} title={page.title} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{t("syncing")}</div>
      )}
    </div>
  );
}

interface PageEditorContentProps {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  editable: boolean;
  user: AuthUser | null;
  title: string;
}

/** Only mounted once the Hocuspocus provider has finished its initial sync
 * — creating the TipTap editor (and its Collaboration extension) before
 * that point risks writing a default empty-document paragraph into the
 * shared Yjs doc ahead of the real synced state, a documented TipTap/Yjs
 * gotcha where two not-yet-synced clients can each insert their own
 * duplicate empty content. Splitting into a child component (rather than
 * conditionally configuring `useEditor` in the parent) means `useEditor`
 * is called exactly once per real mount, with no stale-then-recreated
 * editor instance churn. */
function PageEditorContent({ ydoc, provider, editable, user, title }: PageEditorContentProps) {
  const editor = useEditor({
    extensions: [
      // Yjs is the undo/redo source of truth for a collaborative document
      // -- TipTap's own history extension (part of StarterKit by default)
      // would fight the Collaboration extension's, so it's disabled here.
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      DamAssetNode,
      // Adds `editor.storage.markdown.getMarkdown()` for Markdown export
      // (F6) -- purely a serializer, doesn't change editing behavior.
      Markdown,
      ...(user
        ? [
            CollaborationCaret.configure({
              provider,
              // CollaborationCaret sets its own awareness `user` field on
              // mount (from this option, or its own null-filled default if
              // omitted) -- it does not read whatever
              // `provider.setAwarenessField` set earlier in the parent, so
              // it must be given the same info here or it silently
              // overwrites the presence pill's data with nulls.
              user: { name: displayName(user), color: colorForUserId(user.id) },
            }),
          ]
        : []),
    ],
    editable,
    immediatelyRender: false,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <EditorToolbar editor={editor} title={title} />
      <div className="flex-1 overflow-y-auto px-6 py-4 print:overflow-visible">
        <EditorContent editor={editor} className="prose prose-slate max-w-3xl print:max-w-none focus:outline-none" />
      </div>
    </div>
  );
}
