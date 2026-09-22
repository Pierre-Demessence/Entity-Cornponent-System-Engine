import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const docsDir = join(root, 'docs');

/**
 * `docs/archived/**` is deliberately exempt from the link check. Those files
 * are frozen records: they reference files by the names those files had while
 * the document was alive, and rewriting them defeats the archive. This is the
 * same call recorded in `docs/plans/done/roadmap-consolidation.md`, which keeps
 * the exemption intentional rather than accidental.
 */
function isArchived(path: string): boolean {
  return path === join(docsDir, 'archived')
    || path.startsWith(`${join(docsDir, 'archived')}\\`)
    || path.startsWith(`${join(docsDir, 'archived')}/`);
}

function walkMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!isArchived(full)) {
        found.push(...walkMarkdown(full));
      }
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

interface StatusDoc {
  readonly file: string;
  /** Every other h3/h4 heading must end with one of these statuses. */
  readonly statuses: readonly string[];
  /** Headings that are document structure, not entries. */
  readonly structural: readonly string[];
}

const statusDocs: readonly StatusDoc[] = [
  {
    file: join(docsDir, 'roadmap', 'ecs-module-backlog.md'),
    statuses: ['deferred', 'speculative'],
    structural: [
      'Status vocabulary',
      'Entry shape',
      'Version suffixes (V1 / V2 / …)',
      'Engine extension rule-book',
    ],
  },
  {
    file: join(docsDir, 'roadmap', 'non-goals.md'),
    statuses: ['declined', 'superseded'],
    structural: [],
  },
];

function headings(text: string): string[] {
  return text
    .split('\n')
    .filter(line => /^#{3,4} /.test(line))
    .map(line => line.replace(/^#{3,4} /, '').trim());
}

const read = (file: string): string => readFileSync(file, 'utf8');

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
  it('the module backlog records no shipped entry', () => {
    const shipped = headings(read(statusDocs[0].file)).filter(heading =>
      /shipped|✅/.test(heading),
    );
    expect(shipped).toEqual([]);
  });

  it('no roadmap doc uses a checkmark to record shipped work', () => {
    const roadmapDir = join(docsDir, 'roadmap');
    const offending = readdirSync(roadmapDir)
      .filter(name => name.endsWith('.md'))
      .flatMap(name =>
        headings(read(join(roadmapDir, name)))
          .filter(heading => heading.includes('✅'))
          .map(heading => `docs/roadmap/${name}: "${heading}"`),
      );
    expect(offending).toEqual([]);
  });

  it('every status-doc entry carries a status from that document vocabulary', () => {
    const offending: string[] = [];
    for (const doc of statusDocs) {
      const allowed = new RegExp(`—\\s*(?:${doc.statuses.join('|')})\\s*$`);
      for (const heading of headings(read(doc.file))) {
        if (doc.structural.includes(heading)) {
          continue;
        }
        if (!allowed.test(heading)) {
          offending.push(`${relative(root, doc.file)}: "${heading}"`);
        }
      }
    }
    expect(offending).toEqual([]);
  });
});
