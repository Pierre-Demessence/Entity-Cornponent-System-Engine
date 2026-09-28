import type { ExampleEntry } from '../examples/manifest';

/**
 * Generates the Examples section of the Starlight site: one MDX page per
 * prototype in `examples/manifest.ts`, plus an overview page. The manifest is the
 * only source — nothing here is authored per prototype — so a prototype cannot
 * be on the site without being in the catalogue, or the reverse.
 *
 * Each prototype page mounts the prototype in place through `ExampleStage`, then
 * states what it is: the summary, the controls, a link to its source folder and
 * the modules it exercises.
 *
 * Pure: this module writes nothing. The CLI wrapper (`examples.gen.ts`) writes
 * the files; the test (`examples.test.ts`) asserts the same output.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXAMPLE_GROUPS, EXAMPLES } from '../examples/manifest';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const REPO_TREE = 'https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main';

export interface ExamplePage {
  markdown: string;
  /** Path under `website/src/content/docs/`. */
  outPath: string;
}

/** Where the generated pages live, relative to `website/src/content/docs/`. */
export const EXAMPLES_DIR = 'examples';

function quoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function frontmatter(title: string, description: string, sidebar: { hidden?: boolean; order?: number } = {}): string {
  const lines = [
    sidebar.hidden ? '  hidden: true' : '',
    sidebar.order === undefined ? '' : `  order: ${sidebar.order}`,
  ].filter(line => line !== '');
  const block = lines.length > 0 ? `sidebar:\n${lines.join('\n')}\n` : '';
  return `---\ntitle: ${quoted(title)}\ndescription: ${quoted(description)}\n${block}---\n\n`;
}

/** A module links to its Manual guide when it has one, and is plain code otherwise. */
function moduleLink(name: string): string {
  return existsSync(join(ROOT, 'src/modules', name, 'README.md'))
    ? `[\`${name}\`](../../manual/modules/${name}/)`
    : `\`${name}\``;
}

function renderExamplePage(entry: ExampleEntry, order: number): ExamplePage {
  const parts = [
    `${frontmatter(entry.title, entry.summary, { order })}import ExampleStage from '../../../components/ExampleStage.astro';`,
    `<ExampleStage id="${entry.id}" />`,
  ];
  if (entry.isolation)
    parts.push(`:::caution[Cross-origin isolation]\n${entry.isolation}\n:::`);
  parts.push(entry.summary);
  if (entry.challenge !== undefined)
    parts.push(`Built for rung ${entry.challenge} of the [20 Games Challenge](${REPO_TREE}/docs/twenty-games-challenge.md).`);
  parts.push(`**Controls:** ${entry.controls}`);
  parts.push(`**Source:** [\`examples/${entry.id}\`](${REPO_TREE}/examples/${entry.id})`);
  parts.push(`**Exercises:** ${entry.modules.map(moduleLink).join(', ')}.`);
  return { markdown: `${parts.join('\n\n')}\n`, outPath: `${EXAMPLES_DIR}/${entry.id}.mdx` };
}

function renderOverviewPage(entries: readonly ExampleEntry[]): ExamplePage {
  const intro = [
    `Every prototype under \`examples/\` is a first-class engine consumer: a small, runnable game or harness that imports the engine only through its public paths (\`@pierre/ecs\`, \`@pierre/ecs/modules/*\`) — the same entry points an outside consumer gets. Each page below runs one in place, next to its source and the modules it exercises.`,
    `Press **Restart** to start over, or **Stop** to stop the demo. Each prototype is its own small Vite app; to run one locally, open its folder and use the scripts in its \`package.json\`. The \`hub\` app runs them all from a single page.`,
  ];
  const groups = EXAMPLE_GROUPS.flatMap((group) => {
    const members = entries.filter(entry => entry.group === group.id);
    if (members.length === 0)
      return [];
    const rows = members.map(entry => `- [**${entry.title}**](./${entry.id}/) — ${entry.summary}`);
    return [`## ${group.title}`, group.blurb, rows.join('\n')];
  });
  const description = 'Runnable prototypes, each built to prove something about the engine.';
  return {
    markdown: `${frontmatter('Examples', description, { hidden: true })}${[...intro, ...groups].join('\n\n')}\n`,
    outPath: `${EXAMPLES_DIR}/index.mdx`,
  };
}

/** Build the overview and one page per entry, ready to write into the content directory. */
export function renderExamplePages(entries: readonly ExampleEntry[] = EXAMPLES): ExamplePage[] {
  return [
    renderOverviewPage(entries),
    ...entries.map((entry, index) => renderExamplePage(entry, index)),
  ];
}
