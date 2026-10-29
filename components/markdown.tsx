import type { ReactNode } from "react";

/**
 * Tiny, safe Markdown renderer for chat bubbles (0 dependencies).
 *
 * Mistral (like every LLM) only returns plain text in Markdown — there is
 * no Mistral-specific renderer. Instead of react-markdown/remark (~100 kB
 * and an HTML pipeline to sanitize), this parses the subset a chat model
 * actually emits and builds React nodes directly: raw HTML in a message
 * is rendered as literal text, never injected, so no DOMPurify is needed.
 *
 * Supported: **bold**, *italic*, ~~strike~~, `code`, ``` fences ```,
 * # headings, - / 1. lists, > quotes, ---, [links](https://…), tables.
 */

const safeUrl = (href: string) => /^(https?:\/\/|mailto:)/i.test(href);

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;
  const key = () => `${keyPrefix}-${index++}`;
  const pushText = (value: string) => {
    if (value) nodes.push(value);
  };

  while (rest.length > 0) {
    const special = rest.search(/[`*_~\[<]|https?:\/\/|www\./);
    if (special === -1) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, special));
    rest = rest.slice(special);

    // Inline code: `code` or ``code``
    if (rest.startsWith("`")) {
      const fence = rest.startsWith("``") ? "``" : "`";
      const end = rest.indexOf(fence, fence.length);
      if (end > fence.length) {
        nodes.push(
          <code
            key={key()}
            className="rounded-md bg-[color-mix(in_srgb,currentColor_14%,transparent)] px-1 py-0.5 font-mono text-[0.85em]"
          >
            {rest.slice(fence.length, end)}
          </code>,
        );
        rest = rest.slice(end + fence.length);
        continue;
      }
    }

    // Emphasis: ***x***, **x**, __x__, *x*, _x_, ~~x~~
    const emphasis = rest.match(/^(\*\*\*|___|\*\*|__|\*|_|~~)([\s\S]+?)\1/);
    if (emphasis && emphasis[2].trim() !== "") {
      const [, marker, inner] = emphasis;
      const parsed = parseInline(inner, key());
      if (marker === "***" || marker === "___") {
        nodes.push(
          <strong key={key()} className="font-semibold">
            <em>{parsed}</em>
          </strong>,
        );
      } else if (marker === "**" || marker === "__") {
        nodes.push(
          <strong key={key()} className="font-semibold">
            {parsed}
          </strong>,
        );
      } else if (marker === "~~") {
        nodes.push(<del key={key()}>{parsed}</del>);
      } else {
        nodes.push(<em key={key()}>{parsed}</em>);
      }
      rest = rest.slice(emphasis[0].length);
      continue;
    }

    // Link: [label](href)
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
    if (link) {
      const [, label, href] = link;
      nodes.push(
        safeUrl(href) ? (
          <a
            key={key()}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="break-words underline underline-offset-2"
          >
            {parseInline(label, key())}
          </a>
        ) : (
          parseInline(label, key())
        ),
      );
      rest = rest.slice(link[0].length);
      continue;
    }

    // Bare URL
    const bare = rest.match(/^(https?:\/\/[^\s<]+|www\.[^\s<]+)/);
    if (bare) {
      const href = bare[0].startsWith("www.") ? `https://${bare[0]}` : bare[0];
      nodes.push(
        <a
          key={key()}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-words underline underline-offset-2"
        >
          {bare[0]}
        </a>,
      );
      rest = rest.slice(bare[0].length);
      continue;
    }

    // Not a construct after all: emit the character literally.
    pushText(rest[0]);
    rest = rest.slice(1);
  }
  return nodes;
}

function renderParagraph(lines: string[], key: string, lead?: ReactNode): ReactNode {
  return (
    <p key={key}>
      {lead}
      {lines.map((line, i) => (
        <span key={`${key}-line-${i}`}>
          {i > 0 ? <br /> : null}
          {parseInline(line, `${key}-${i}`)}
        </span>
      ))}
    </p>
  );
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

export function Markdown({ source, lead }: { source: string; lead?: ReactNode }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const leadBox: { value: ReactNode } = { value: lead };
  const takeLead = () => {
    const current = leadBox.value;
    leadBox.value = undefined;
    return current;
  };
  let i = 0;
  let blockIndex = 0;
  const key = () => `block-${blockIndex++}`;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={key()}
          className="overflow-x-auto rounded-xl bg-[color-mix(in_srgb,currentColor_10%,transparent)] p-3 font-mono text-xs leading-5"
        >
          {takeLead()}
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Heading
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p key={key()} className={level <= 2 ? "text-base font-semibold" : "font-semibold"}>
          {takeLead()}
          {parseInline(heading[2], key())}
        </p>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key()} className="border-current opacity-20" />);
      i++;
      continue;
    }

    // Table: header row + `| --- |` separator
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i++]));
      }
      blocks.push(
        <div key={key()} className="overflow-x-auto">
          {takeLead()}
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className="border-b border-current/20 px-2 py-1 font-semibold">
                    {parseInline(cell, `${key()}-h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {header.map((_, c) => (
                    <td key={c} className="border-b border-current/10 px-2 py-1 align-top">
                      {parseInline(row[c] ?? "", `${key()}-r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key()} className="border-l-2 border-current/30 pl-3 opacity-90">
          {takeLead()}
          {quoted.map((quotedLine, q) => (
            <span key={q}>
              {q > 0 ? <br /> : null}
              {parseInline(quotedLine, `${key()}-q${q}`)}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    // List (unordered or ordered); indented lines continue the last item
    const listMatch = line.match(/^\s*(?:[-*+]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[0]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
        if (item) {
          items.push(item[1]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length > 0) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key()} className={`${ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              {itemIndex === 0 ? takeLead() : null}
              {parseInline(item.replace(/^\[[ xX]\]\s+/, ""), `${key()}-item-${itemIndex}`)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Paragraph: consecutive non-blank lines (a new block interrupts it)
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      (paragraph.length === 0 ||
        !/^\s*(```|#{1,6}\s|>|(?:[-*+]|\d+[.)])\s)/.test(lines[i]))
    ) {
      paragraph.push(lines[i++]);
    }
    blocks.push(renderParagraph(paragraph, key(), takeLead()));
  }

  return <div className="space-y-2 break-words [overflow-wrap:anywhere]">{blocks}</div>;
}
