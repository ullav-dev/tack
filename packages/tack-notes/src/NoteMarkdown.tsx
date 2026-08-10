"use client";

import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  body: string;
}

const imgRenderer: Components = {
  img: ({ src, alt }) => {
    if (!src || typeof src !== "string") return null;
    return <img src={src} alt={alt ?? ""} className="max-w-full rounded" />;
  },
};

/** Renders a Note's markdown body — `react-markdown` + `remark-gfm`, the
 * same stack already used by togra/lagan/clann-webapp/awe-client for
 * markdown rendering across this org. Custom `img` renderer just applies
 * consistent styling -- no authenticated-fetch indirection: DAM asset
 * thumbnails are served with no auth required, matching every other
 * first-party app's own DAM-embedding code. Extracted verbatim from
 * `tack`'s own `NoteMarkdown.tsx`. */
export default function NoteMarkdown({ body }: Props) {
  return (
    <div className="prose prose-slate prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={imgRenderer}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

/** Same markdown->HTML rendering as the component above, as a plain string
 * -- used by HTML export to turn a note/reply body into an HTML fragment
 * without mounting anything. */
export function markdownToHtml(body: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={imgRenderer}>
      {body}
    </ReactMarkdown>
  );
}
