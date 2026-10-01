import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const docsDir = join(root, 'docs');

function walkMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkMarkdown(full));
    }
    else if (entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

function liveDocs(): string[] {
  return [
    ...walkMarkdown(docsDir),
    join(root, 'README.md'),
    join(root, 'AGENTS.md'),
  ];
}

/** `[label](target.md)` or `[label](target.md#anchor)` — absolute URLs excluded. */
function relativeMarkdownLinks(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      found.push(target);
    }
  }
  return found;
}

const backlogFile = join(docsDir, 'backlog.md');
const roadmapFile = join(docsDir, 'roadmap.md');

const read = (file: string): string => readFileSync(file, 'utf8');
const lines = (text: string): string[] => text.split(/\r?\n/);

/** The lines of one `## ` section of a Markdown document, heading excluded. */
function sectionLines(text: string, heading: string): string[] {
  const all = lines(text);
  const start = all.indexOf(`## ${heading}`);
  if (start === -1) {
    throw new Error(`no "## ${heading}" section`);
  }
  const end = all.findIndex((line, i) => i > start && line.startsWith('## '));
  return all.slice(start + 1, end === -1 ? undefined : end);
}

describe('docs links', () => {
  it('every relative .md link in a live doc resolves', () => {
    const broken: string[] = [];
    for (const file of liveDocs()) {
      for (const target of relativeMarkdownLinks(read(file))) {
        if (!existsSync(resolve(dirname(file), target))) {
          broken.push(`${relative(root, file)} -> ${target}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('status docs describe open work only', () => {
  it('no status doc uses a checkmark to record shipped work', () => {
    const offending = [backlogFile, roadmapFile].flatMap(file =>
      lines(read(file))
        .filter(line => line.includes('✅'))
        .map(line => `${relative(root, file)}: "${line.trim()}"`),
    );
    expect(offending).toEqual([]);
  });

  it('every module backlog entry carries a status', () => {
    // An entry is a top-level bullet plus its wrapped lines; nested bullets are notes.
    const entries: string[] = [];
    for (const line of sectionLines(read(backlogFile), 'Modules')) {
      if (line.startsWith('- ')) {
        entries.push(line);
      }
      else if (/^ {2}[^\s-]/.test(line) && entries.length > 0) {
        entries[entries.length - 1] += ` ${line.trim()}`;
      }
    }
    expect(entries.length).toBeGreaterThan(0);
    const offending = entries.filter(entry =>
      !/ — \*\*(?:Ready|Deferred|Speculative)\*\*/.test(entry),
    );
    expect(offending).toEqual([]);
  });
});
