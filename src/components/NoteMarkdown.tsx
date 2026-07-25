"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  body: string;
}

/** Renders a Note's markdown body — `react-markdown` + `remark-gfm`, the
 * same stack already used by togra/lagan/clann-webapp for markdown
 * rendering in this org. Custom `img` renderer just applies consistent
 * styling -- no authenticated-fetch indirection needed: `ullav-dam-server`
 * serves both `/assets/:id/thumbnail` and `/assets/:id/download` with no
 * auth required (verified directly against the server's handlers, which
 * take no `AuthUser` extractor, and empirically via curl with no
 * Authorization header), matching what togra's own DAM-embedding code
 * actually does (a plain `<img src>`, no auth header). */
export default function NoteMarkdown({ body }: Props) {
  return (
    <div className="prose prose-slate prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            if (!src || typeof src !== "string") return null;
            return <img src={src} alt={alt ?? ""} className="max-w-full rounded" />;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
