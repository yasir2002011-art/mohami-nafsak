import React from "react";

/**
 * عارض Markdown مبسّط.
 *
 * يبني عناصر React مباشرة ولا يستخدم dangerouslySetInnerHTML إطلاقًا،
 * فلا مجال لحقن HTML أو سكربتات من محتوى المقالات (حماية من XSS).
 */
export default function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="my-4 space-y-2">
        {listBuffer.map((item, index) => (
          <li key={index} className="flex items-start gap-2.5 leading-loose text-slate-700">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
      continue;
    }

    flushList();

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} className="mt-7 mb-2 text-lg font-extrabold text-slate-900">
          {inline(line.slice(4))}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="mt-8 mb-3 text-xl font-extrabold text-slate-900">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={key++} className="mt-8 mb-3 text-2xl font-black text-slate-900">
          {inline(line.slice(2))}
        </h2>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={key++}
          className="my-4 border-r-4 border-brand-300 bg-brand-50 py-3 pr-4 leading-loose text-slate-600"
        >
          {inline(line.slice(2))}
        </blockquote>,
      );
    } else if (line.trim() === "") {
      // فقرة فارغة — تُتجاهل
    } else {
      blocks.push(
        <p key={key++} className="my-3 leading-loose text-slate-700">
          {inline(line)}
        </p>,
      );
    }
  }

  flushList();

  return <div className="text-[15px]">{blocks}</div>;
}

/** الغامق **نص** والروابط [نص](رابط) — كل شيء آخر يبقى نصًا عاديًا */
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-extrabold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        // روابط http/https فقط — يمنع javascript: و data:
        const safe = /^https?:\/\//i.test(href) || href.startsWith("/");
        nodes.push(
          safe ? (
            <a
              key={key++}
              href={href}
              target={href.startsWith("/") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="font-bold text-brand-700 hover:underline"
            >
              {label}
            </a>
          ) : (
            <span key={key++}>{label}</span>
          ),
        );
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
