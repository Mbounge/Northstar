import { createElement, useState, type ReactNode } from "react";
import { downloadArtifact, resolveArtifactLink } from '@/lib/canvas-v2/creative/download';
import type { NorthstarArtifact } from '@/lib/canvas-v2/creative/types';
import { chatEvidenceHandles, type CanvasV2ChatEvidenceReference } from '@/lib/canvas-v2/chat-evidence';
import { cn } from "@/lib/utils";

type AssetReference = Extract<CanvasV2ChatEvidenceReference, { kind: 'asset' }>;

function InlineEvidenceScreen({ screens, onOpen }: { screens: AssetReference[]; onOpen?: (screen: AssetReference) => void }) {
  const [index, setIndex] = useState(0);
  const screen = screens[index] ?? screens[0];
  return <span className="float-left mb-1 mr-3 flex w-[82px] flex-col" data-testid="canvas-v2-inline-screen">
    <button type="button" onClick={() => onOpen?.(screen)} title={'Expand ' + screen.label} aria-label={'Expand ' + screen.label} className="flex h-[150px] w-[82px] items-start justify-center overflow-hidden bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7561ed]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={screen.url} alt={screen.label} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain object-top" />
    </button>
    <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-3 text-[#5e5969] dark:text-[#c8c3d3]">{screen.label}</span>
    {screens.length > 1 && <span className="mt-0.5 inline-flex items-center justify-between text-[10px] text-[#6754df] dark:text-[#b3a8ff]">
      <button type="button" onClick={() => setIndex((index + screens.length - 1) % screens.length)} aria-label="Previous screen" className="px-1">‹</button>
      <span>{index + 1} of {screens.length}</span>
      <button type="button" onClick={() => setIndex((index + 1) % screens.length)} aria-label="Next screen" className="px-1">›</button>
    </span>}
  </span>;
}

function renderInline(text: string, keyPrefix: string, artifacts: NorthstarArtifact[], references: Record<string, CanvasV2ChatEvidenceReference>, onOpenEvidence?: (screen: AssetReference) => void, evidenceFirst = false): ReactNode[] {
  const pattern = /(`[^`]+`|cite[^\n]*(?:|$)|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(<?(?:https?:\/\/|artifact:|(?:sandbox:)?\/mnt\/data\/)[^)>]+>?\))/g;
  const evidencePattern = /(\[[^\]]+\]\(ns-(?:flow|asset)-\d+(?:[–—-]\d+)?\)|\x60ns-(?:flow|asset)-\d+(?:[–—-]\d+)?\x60|ns-(?:flow|asset)-\d+(?:[–—-]\d+)?)/g;
  const parts = text.split(new RegExp('(' + evidencePattern.source.slice(1, -1) + '|' + pattern.source.slice(1, -1) + ')', 'g')).filter((part): part is string => Boolean(part));
  const handlesFor = (part: string) => chatEvidenceHandles(part);
  const handleFor = (part: string) => handlesFor(part)[0];
  const screens = [...new Set(parts.flatMap(part => handlesFor(part)))]
    .map(handle => references[handle]).filter((ref): ref is AssetReference => ref?.kind === 'asset');
  const firstScreenPart = parts.findIndex(part => references[handleFor(part) ?? '']?.kind === 'asset');
  const lastScreenPart = parts.findLastIndex(part => references[handleFor(part) ?? '']?.kind === 'asset');
  const repeatedFlowParts = new Set(parts.flatMap((part, index) => {
    const reference = references[handleFor(part) ?? ''];
    if (reference?.kind !== 'flow') return [];
    const prior = parts.slice(Math.max(0, index - 3), index).join('').replace(/[\s*_`()[\]]/g, '');
    return prior.endsWith(reference.label.replace(/\s/g, '')) ? [index] : [];
  }));

  const rendered = parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const handle = handleFor(part);
    const reference = handle ? references[handle] : undefined;
    if (reference?.kind === 'asset') return !evidenceFirst && index === firstScreenPart ? <InlineEvidenceScreen key={key} screens={screens} onOpen={onOpenEvidence} /> : null;
    if (repeatedFlowParts.has(index)) return null;
    if (reference?.kind === 'flow') {
      const label = part.match(/^\[([^\]]+)\]/)?.[1] ?? reference.label;
      return <span key={key} className="font-semibold">{label}</span>;
    }
    if (handle && /^ns-(?:asset|flow)-\d+(?:[–—-]\d+)?$/.test(part.replaceAll(String.fromCharCode(96), ''))) return <span key={key} className="text-zinc-500">{handle.startsWith('ns-flow-') ? 'Flow unavailable' : 'Screen unavailable'}</span>;
    if (handle && /^\[[^\]]+\]\(ns-(?:asset|flow)-\d+(?:[–—-]\d+)?\)$/.test(part)) return <span key={key}>{part.match(/^\[([^\]]+)\]/)?.[1]} <span className="text-zinc-500">(unavailable)</span></span>;

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

    if (screens.length && index > firstScreenPart && index < lastScreenPart && /^[,;\s]+$/.test(part)) return null;
    if (screens.length && index === firstScreenPart - 1) return part.replace(/\(\s*$/, '');
    if (screens.length && index === lastScreenPart + 1) return part.replace(/^[,;\s]*\)\s*/, ' ');
    if (repeatedFlowParts.has(index + 1)) return part.replace(/\(\s*$/, '');
    if (repeatedFlowParts.has(index - 1)) return part.replace(/^\s*\)\s*/, ' ');
    return part;
  });
  return evidenceFirst && screens.length ? [<InlineEvidenceScreen key={`${keyPrefix}-evidence`} screens={screens} onOpen={onOpenEvidence} />, ...rendered] : rendered;
}

export function CanvasV2MarkdownMessage({ content, artifacts = [], evidenceReferences = {}, onOpenEvidence }: { content: string; artifacts?: NorthstarArtifact[]; evidenceReferences?: Record<string, CanvasV2ChatEvidenceReference>; onOpenEvidence?: (screen: AssetReference) => void }) {
  const renderInlineMarkdown = (text: string, key: string, evidenceFirst = false) => renderInline(text, key, artifacts, evidenceReferences, onOpenEvidence, evidenceFirst);
  const displayContent = content.replace(/([^\n|()]+?)\s*\(\[([^\]]+)\]\(ns-flow-\d+\)\)/g, (whole, before: string, label: string) => before.replace(/\*+/g, '').trimEnd().endsWith(label) ? before : whole);
  const lines = displayContent.replace(/\r\n/g, "\n").split("\n");
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
          <tbody>{rows.map((row, i) => <tr key={i}>{headings.map((_, j) => <td key={j} className="border-b border-zinc-100 px-3 py-2 align-top leading-relaxed dark:border-white/10"><div className="flow-root">{renderInlineMarkdown(row[j] ?? "", `td-${i}-${j}`, true)}</div></td>)}</tr>)}</tbody>
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
