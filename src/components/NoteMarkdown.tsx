"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/contexts/AuthContext";
import AuthImage from "@/components/AuthImage";

interface Props {
  body: string;
}

/** Renders a Note's markdown body — `react-markdown` + `remark-gfm`, the
 * same stack already used by togra/lagan/clann-webapp for markdown
 * rendering in this org. Custom `img` renderer mirrors
 * `togra/src/components/ideas/StickyCard.tsx`'s DAM-URL detection exactly
 * (same heuristic: `/api/dam/` or `/assets/` in the URL). */
export default function NoteMarkdown({ body }: Props) {
  const { token } = useAuth();

  return (
    <div className="prose prose-slate prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            if (!src || typeof src !== "string") return null;
            if (token && (src.includes("/api/dam/") || src.includes("/assets/"))) {
              return <AuthImage src={src} alt={alt ?? ""} token={token} />;
            }
            return <img src={src} alt={alt ?? ""} className="max-w-full rounded" />;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
