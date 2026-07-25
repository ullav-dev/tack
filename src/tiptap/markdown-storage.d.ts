import type { MarkdownStorage } from "tiptap-markdown";

// tiptap-markdown ships MarkdownStorage but doesn't itself augment
// @tiptap/core's `Storage` interface with it (unlike DamAssetNode.ts's
// `insertDamAsset` command, which does its own augmentation for the same
// reason) -- without this, `editor.storage.markdown` has no type.
declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage;
  }
}
