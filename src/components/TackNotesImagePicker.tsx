"use client";

import { useAuth } from "@/contexts/AuthContext";
import DamPickerModal from "@/components/DamPickerModal";

/** Adapts tack's own `DamPickerModal` (`@ullav-dev/dam-picker`) to
 * `@ullav-dev/tack-notes`'s generic `ImagePicker` prop shape --
 * `{onSelect: (asset: {url, name}) => void; onClose: () => void}`. Always
 * embeds the thumbnail URL, not the full asset -- same as the old
 * `MarkdownToolbar.insertAsset` this replaces (`ullav-dam-server` serves
 * both `/assets/:id/thumbnail` and `/assets/:id/download` with no auth
 * required). Renders nothing if there's no token -- `MarkdownToolbar` only
 * shows the "Insert image" button when `ImagePicker` is passed at all, so a
 * host page should only pass this once a token exists. */
export default function TackNotesImagePicker({ onSelect, onClose }: { onSelect: (asset: { url: string; name: string }) => void; onClose: () => void }) {
  const { token } = useAuth();
  if (!token) return null;
  return (
    <DamPickerModal
      token={token}
      onSelect={(asset) => onSelect({ url: asset.url.replace(/\/?$/, "/thumbnail"), name: asset.name })}
      onClose={onClose}
    />
  );
}
