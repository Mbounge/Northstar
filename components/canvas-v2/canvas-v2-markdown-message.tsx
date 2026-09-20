import { createElement, type ReactNode } from "react";
import { downloadArtifact, resolveArtifactLink } from '@/lib/canvas-v2/creative/download';
import type { NorthstarArtifact } from '@/lib/canvas-v2/creative/types';
import { cn } from "@/lib/utils";

function renderInline(text: string, keyPrefix: string, artifacts: NorthstarArtifact[]): ReactNode[] {
  const pattern = /(`[^`]+`|cite[^\n]*(?:|$)|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(<?(?:https?:\/\/|artifact:|(?:sandbox:)?\/mnt\/data\/)[^)>]+>?\))/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("cite")) {
      // A streamed citation can arrive in pieces. Only link complete, explicit URLs;
      // native reference IDs cannot be reconstructed from their names.
      if (!part.endsWith("")) return null;
      return <span key={key}>{part.slice("cite".length, -1).split("").map((reference, citationIndex) => {
        let url: URL | undefined;
        try { url = new URL(reference); } catch { /* Native reference without a URL. */ }
        if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password) {
          return <span key={citationIndex} className="text-zinc-500" title="The source URL was not supplied with this reference."> [Source unavailable]</span>;
        }
        return <a key={citationIndex} href={url.href} target="_blank" rel="noreferrer" className="ml-1 font-[700] text-[#5E50F5] underline underline-offset-2 dark:text-[#BDB6FF]">{url.hostname.replace(/^www\./, "")}</a>;
      })}</span>;
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-[800]">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const fileLink = part.match(/^\[([^\]]+)\]\(<?(artifact:[^)>]+|(?:sandbox:)?\/mnt\/data\/[^)>]+)>?\)$/);
    if (fileLink) {
      const artifact = resolveArtifactLink(fileLink[2], artifacts);
      return artifact ? <button key={key} type="button" onClick={() => void downloadArtifact(artifact)} className="font-semibold text-[#5E50F5] underline underline-offset-2 dark:text-[#BDB6FF]">{fileLink[1]}</button>
        : <span key={key}>{fileLink[1]} <span className="text-zinc-500">(file not exported)</span></span>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(<?(https?:\/\/[^)>]+)>?\)$/);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="font-[700] text-[#5E50F5] underline decoration-[#6B5CFF]/35 underline-offset-2 dark:text-[#BDB6FF]"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

export function CanvasV2MarkdownMessage({ content, artifacts = [] }: { content: string; artifacts?: NorthstarArtifact[] }) {
  const renderInlineMarkdown = (text: string, key: string) => renderInline(text, key, artifacts);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  const isSpecialLine = (line: string) =>
    /^```/.test(line) ||
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^---+$/.test(line);

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="my-3 overflow-x-auto border border-black/5 bg-black/[0.035] p-3 font-mono text-[0.85em] leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
          data-language={language || undefined}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(createElement(`h${level + 1}`, {
        key: `heading-${blocks.length}`,
        className: cn("font-bold tracking-tight text-zinc-950 dark:text-white", level === 1 ? "mb-2 mt-4 text-[1.15em]" : "mb-1.5 mt-3 text-[1.05em]"),
      }, renderInlineMarkdown(headingMatch[2], `heading-inline-${blocks.length}`)));
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 space-y-1.5 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2">
              <span className="mt-[8px] h-1 w-1 shrink-0 bg-[#6B5CFF]" />
              <span>{renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const start = Number(line.match(/^\d+/)![0]);
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
        // Blank lines make a loose list, not a fresh list starting at one.
        let next = index;
        while (next < lines.length && !lines[next].trim()) next++;
        if (/^\d+\.\s+/.test(lines[next] ?? "")) index = next;
      }
      blocks.push(
        <ol start={start} key={`ol-${blocks.length}`} className="my-2 space-y-1.5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="grid grid-cols-[18px_1fr] gap-1.5">
              <span className="font-[800] text-[#6B5CFF] dark:text-[#BDB6FF]">{start + itemIndex}.</span>
              <span>{renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="my-3 border-l-2 border-[#6B5CFF]/55 pl-3 text-zinc-600 dark:text-zinc-300"
        >
          {renderInlineMarkdown(quoteLines.join(" "), `quote-inline-${blocks.length}`)}
        </blockquote>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<div key={`rule-${blocks.length}`} className="my-4 h-px bg-black/5 dark:bg-white/10" />);
      index += 1;
      continue;
    }

    if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "")) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
      const headings = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) rows.push(cells(lines[index++]));
      blocks.push(<div key={`table-${blocks.length}`} className="my-3 max-w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-white/15" tabIndex={0} role="region" aria-label="Comparison table">
        <table className="w-full border-collapse text-left text-[0.9em]">
          <thead><tr>{headings.map((cell, i) => <th key={i} scope="col" className="border-b border-zinc-200 bg-black/[0.03] px-3 py-2 font-semibold dark:border-white/15 dark:bg-white/5">{renderInlineMarkdown(cell, `th-${i}`)}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{headings.map((_, j) => <td key={j} className="border-b border-zinc-100 px-3 py-2 align-top dark:border-white/10">{renderInlineMarkdown(row[j] ?? "", `td-${i}-${j}`)}</td>)}</tr>)}</tbody>
        </table>
      </div>);
      continue;
    }
    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialLine(lines[index]) && !(lines[index].includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? ""))
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="my-2 first:mt-0 last:mb-0">
        {renderInlineMarkdown(paragraphLines.join(" "), `paragraph-inline-${blocks.length}`)}
      </p>
    );
  }

  return <div data-testid="canvas-v2-markdown" className="min-w-0 break-words [overflow-wrap:anywhere]">{blocks}</div>;
}
