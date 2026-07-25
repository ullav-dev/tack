import { Node, mergeAttributes } from "@tiptap/core";

export interface DamAssetAttrs {
  src: string;
  alt: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    damAsset: {
      insertDamAsset: (attrs: DamAssetAttrs) => ReturnType;
    };
  }
}

/** A DAM (Comad) asset embedded as a first-class atomic block node --
 * stores the asset's `src`/`alt` as node attrs (synced through Yjs like any
 * other Page content), rather than a markdown-style bare link, per the
 * platform's original architecture decision. Renders as a plain `<img>`:
 * `ullav-dam-server`'s thumbnail/download endpoints require no auth
 * (verified directly against the server, see NoteMarkdown.tsx's Notes-side
 * equivalent), so there's no authenticated-fetch NodeView to build here --
 * this is closer to a normal TipTap image extension than initially
 * planned. */
const DamAssetNode = Node.create({
  name: "damAsset",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-dam-asset]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-dam-asset": "true", class: "rounded-lg max-w-full" })];
  },

  addCommands() {
    return {
      insertDamAsset:
        (attrs: DamAssetAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export default DamAssetNode;
