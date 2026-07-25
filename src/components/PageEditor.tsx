"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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
import {
  createPageRevision,
  deletePage,
  getPage,
  getPagePermission,
  listPageRevisions,
  updatePage,
  type Page,
  type PageRevision,
  type PermissionLevel,
} from "@/lib/tack-server-api";
import { displayName } from "@/lib/user-display";
import EditorToolbar from "@/components/EditorToolbar";
import DeletePageModal from "@/components/DeletePageModal";
import PageVersionHistory from "@/components/PageVersionHistory";
import PageLinksPanel from "@/components/PageLinksPanel";
import NoteMarkdown from "@/components/NoteMarkdown";
import DamAssetNode from "@/tiptap/DamAssetNode";
import PageReferenceNode from "@/tiptap/PageReferenceNode";

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

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      {children}
    </svg>
  );
}

const historyIcon = (
  <Icon>
    <circle cx="8" cy="8.5" r="5.5" />
    <path d="M8 5.5v3l2.2 1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.3 2.3 3.3 3.7M10.7 2.3l2 1.4" strokeLinecap="round" />
  </Icon>
);

const saveVersionIcon = (
  <Icon>
    <path d="M3 2.5h7.5L13 5v8a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13V3a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
    <path d="M5.5 2.5v3h4v-3" strokeLinejoin="round" />
    <path d="M5.5 9h5v4.5h-5V9Z" strokeLinejoin="round" />
  </Icon>
);

const linksIcon = (
  <Icon>
    <path
      d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.2 2.2 0 0 1 3 3l-1 1M9 11.5l-1 1a2.2 2.2 0 0 1-3-3l1-1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

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
 * client-side gate were bypassed.
 *
 * Delete (F7): tack-server's soft-delete doesn't cascade to child pages
 * (a deliberate, documented backend simplification), so the delete button
 * is disabled whenever `child_count > 0` -- the user has to move or delete
 * children first, rather than the frontend ever creating pages that are
 * still there but unreachable from the tree. Navigates to the space's own
 * landing route afterward and broadcasts the deletion via
 * `notifyPageDeleted` so the Navigator's PageTree drops it immediately.
 *
 * Version history (F7 8c): same explicit-only "Save as version" model as
 * Notes -- a version is a deliberate snapshot of `content_markdown`, never
 * an automatic side effect of a collaborative edit. "View this version" in
 * `PageVersionHistory` sets `viewingRevision`, which swaps the whole main
 * panel to a read-only Markdown render of that snapshot (via `NoteMarkdown`
 * -- there is no live-editor equivalent of "load this version into the
 * Yjs doc", only a plain rendered view) instead of the live collaborative
 * editor, with the same amber banner/"Show latest" pattern Notes uses.
 * `editable` folds in `!viewingRevision`, so every edit affordance (title,
 * delete, the live editor itself) is disabled while browsing history --
 * consistent with Notes' `NoteThread`. */
export default function PageEditor() {
  const { spaceId, pageId } = useParams<{ spaceId: string; pageId: string }>();
  const { token, user } = useAuth();
  const { notifyPageUpdated, notifyPageDeleted } = usePageEvents();
  const router = useRouter();
  const t = useTranslations("editor");
  const tNotes = useTranslations("notes");

  const [page, setPage] = useState<Page | null>(null);
  const [level, setLevel] = useState<PermissionLevel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);

  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [revisions, setRevisions] = useState<PageRevision[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);
  const [viewingRevision, setViewingRevision] = useState<PageRevision | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) ydocRef.current = new Y.Doc();
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setViewingRevision(null);
    Promise.all([getPage(token, pageId), getPagePermission(token, pageId), listPageRevisions(token, pageId)])
      .then(([p, perm, rv]) => {
        if (cancelled) return;
        setPage(p);
        setTitleDraft(p.title);
        setLevel(perm.level);
        setRevisions(rv);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, pageId]);

  // Browsers derive the default filename in "Print / save as PDF" from the
  // document's <title> at the moment window.print() is called -- without
  // this, every page's PDF would suggest the same generic "Tack" filename.
  // Reset on unmount so navigating elsewhere doesn't leave a stale title.
  useEffect(() => {
    if (!page) return;
    const previous = document.title;
    document.title = page.title || previous;
    return () => {
      document.title = previous;
    };
  }, [page?.title]);

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

  async function deleteThisPage() {
    if (!token || !page) return;
    await deletePage(token, page.id);
    notifyPageDeleted(page.id);
    router.push(`/spaces/${spaceId}/pages`);
  }

  async function saveAsVersion() {
    if (!token || !page) return;
    setCreatingVersion(true);
    setVersionMessage(null);
    try {
      const revision = await createPageRevision(token, page.id);
      setRevisions((prev) => [revision, ...(prev ?? [])]);
      setVersionMessage(tNotes("versionCreated"));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setCreatingVersion(false);
    }
  }

  function handleSelectVersion(revision: PageRevision) {
    setViewingRevision(revision.version === revisions?.[0]?.version ? null : revision);
  }

  if (loadError) return <p className="p-6 text-red-600">{loadError}</p>;
  if (!page || level === null) return <p className="p-6 text-slate-400">{t("loading")}</p>;

  const editable = level === "edit" && !viewingRevision;
  const latestRevision = revisions?.[0] ?? null;

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

        {level === "view" && !viewingRevision && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {t("viewOnly")}
          </span>
        )}

        {latestRevision && !viewingRevision && (
          <span className="shrink-0 text-xs text-slate-400">{tNotes("version", { n: latestRevision.version })}</span>
        )}

        <button
          type="button"
          title={t("pageLinks")}
          aria-label={t("pageLinks")}
          onClick={() => setLinksOpen(true)}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-700 hover:bg-slate-100 transition-colors"
        >
          {linksIcon}
        </button>

        <button
          type="button"
          title={tNotes("versionHistory")}
          aria-label={tNotes("versionHistory")}
          onClick={() => setHistoryOpen(true)}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-700 hover:bg-slate-100 transition-colors"
        >
          {historyIcon}
        </button>

        {level === "edit" && !viewingRevision && (
          <button
            type="button"
            title={tNotes("createVersion")}
            aria-label={tNotes("createVersion")}
            onClick={saveAsVersion}
            disabled={creatingVersion}
            className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
          >
            {saveVersionIcon}
          </button>
        )}

        {editable && (
          <button
            type="button"
            title={page.child_count > 0 ? t("deletePageBlocked") : t("deletePage")}
            aria-label={t("deletePage")}
            onClick={() => setDeleteModalOpen(true)}
            disabled={page.child_count > 0}
            className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
              <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {presence.length > 0 && !viewingRevision && (
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

        {!viewingRevision && (
          <span className="shrink-0 text-xs text-slate-400">{synced ? t("allChangesSaved") : t("syncing")}</span>
        )}
      </div>

      {/* print:hidden's header above never shows in print output -- this is
          what actually appears instead (a plain heading, not the input/badges). */}
      <h1 className="hidden print:block px-6 pt-4 text-xl font-semibold text-slate-800">{page.title}</h1>

      {viewingRevision && (
        <div className="mx-6 mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300 print:border-2 print:border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:font-semibold shrink-0">
          <span>{tNotes("viewingOldVersion", { n: viewingRevision.version })}</span>
          <button
            type="button"
            onClick={() => setViewingRevision(null)}
            className="font-medium underline hover:no-underline shrink-0 print:hidden"
          >
            {tNotes("showLatest")}
          </button>
        </div>
      )}

      {versionMessage && !viewingRevision && (
        <p className="mx-6 mt-2 text-xs text-green-700 print:hidden shrink-0">{versionMessage}</p>
      )}

      {viewingRevision ? (
        <div className="flex-1 overflow-y-auto px-6 py-4 print:overflow-visible">
          <NoteMarkdown body={viewingRevision.content_markdown} />
        </div>
      ) : synced ? (
        <PageEditorContent
          ydoc={ydocRef.current!}
          provider={providerRef.current!}
          editable={editable}
          user={user}
          title={page.title}
          pageId={page.id}
          spaceId={page.space_id}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{t("syncing")}</div>
      )}

      {deleteModalOpen && (
        <DeletePageModal onConfirm={deleteThisPage} onCancel={() => setDeleteModalOpen(false)} />
      )}

      {historyOpen && (
        <PageVersionHistory
          pageId={page.id}
          title={page.title}
          canEdit={level === "edit"}
          onRevisionsChanged={setRevisions}
          onSelectVersion={handleSelectVersion}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {linksOpen && <PageLinksPanel pageId={page.id} canEdit={level === "edit"} onClose={() => setLinksOpen(false)} />}
    </div>
  );
}

interface PageEditorContentProps {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  editable: boolean;
  user: AuthUser | null;
  title: string;
  pageId: string;
  spaceId: string;
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
function PageEditorContent({ ydoc, provider, editable, user, title, pageId, spaceId }: PageEditorContentProps) {
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
      PageReferenceNode,
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
      <EditorToolbar editor={editor} title={title} pageId={pageId} spaceId={spaceId} />
      <div className="flex-1 overflow-y-auto px-6 py-4 print:overflow-visible">
        <EditorContent editor={editor} className="prose prose-slate max-w-3xl print:max-w-none focus:outline-none" />
      </div>
    </div>
  );
}
