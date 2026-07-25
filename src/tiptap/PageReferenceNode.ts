import { Node, mergeAttributes } from "@tiptap/core";

export interface PageReferenceAttrs {
  pageId: string;
  spaceId: string;
  title: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageReference: {
      insertPageReference: (attrs: PageReferenceAttrs) => ReturnType;
    };
  }
}

/** An inline, clickable link to another Page (F7 8d, page-to-page only --
 * see tack-server's `content_references` usage). `title` is a label snapshot
 * taken at insertion time, not live-resolved on render -- same accepted
 * staleness trade-off as `DamAssetNode`'s stored `alt`/`src`; the *backlinks*
 * list (`PageLinksPanel`) is what always resolves live, since that's server
 * data, not embedded Yjs content. Renders as a plain `<a>` (full navigation,
 * not client-side routing) -- simplest correct option given a TipTap
 * NodeView would otherwise need its own router access. */
const PageReferenceNode = Node.create({
  name: "pageReference",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      pageId: { default: null },
      spaceId: { default: null },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-page-reference]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-page-reference": "true",
        href: `/spaces/${node.attrs.spaceId}/pages/${node.attrs.pageId}`,
        class: "inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-rose-50 text-rose-700 no-underline hover:bg-rose-100 font-medium text-sm",
      }),
      node.attrs.title || "Untitled page",
    ];
  },

  addCommands() {
    return {
      insertPageReference:
        (attrs: PageReferenceAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export default PageReferenceNode;
