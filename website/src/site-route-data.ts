/**
 * Per-section sidebars.
 *
 * Starlight configures one sidebar for the whole site, but the Manual and the API
 * reference share nothing, so each section gets its own list here.
 *
 * The configured sidebar stays the superset: Starlight resolves it (expanding
 * `autogenerate`, computing hrefs and `isCurrent`), and this middleware then keeps
 * the entries that belong to the current section and regroups them. Nothing is
 * rebuilt from scratch — the entries are the resolved ones, moved.
 */
import type { StarlightRouteData } from '@astrojs/starlight/route-data';

import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarGroup = Extract<SidebarEntry, { type: 'group' }>;

/** Labels of the top-level groups in `astro.config.mjs`. */
const MANUAL_GROUP = 'Manual';
const API_GROUP = 'API reference';
/** TypeDoc names module pages after their entry point, e.g. `modules/spatial`. */
const MODULE_PREFIX = 'modules/';

function isGroup(entry: SidebarEntry): entry is SidebarGroup {
  return entry.type === 'group';
}

function findGroup(entries: SidebarEntry[], label: string): SidebarGroup | undefined {
  return entries.find((entry): entry is SidebarGroup => entry.type === 'group' && entry.label === label);
}

function overviewLink(href: string, isCurrent: boolean): SidebarEntry {
  return { attrs: {}, badge: undefined, href, isCurrent, label: 'Overview', type: 'link' };
}

/** `badge` is required-but-undefined on resolved entries, hence the explicit key. */
function collapsedGroup(label: string, entries: SidebarEntry[]): SidebarEntry {
  return { badge: undefined, collapsed: true, entries, label, type: 'group' };
}

function manualSidebar(entries: SidebarEntry[], href: string, isCurrent: boolean): SidebarEntry[] {
  const manual = findGroup(entries, MANUAL_GROUP)?.entries ?? [];
  const core = findGroup(manual, 'Core')?.entries ?? [];
  const modules = findGroup(manual, 'Modules')?.entries ?? [];
  return [
    overviewLink(href, isCurrent),
    collapsedGroup('Core', core),
    collapsedGroup('Modules', modules),
  ];
}

function apiSidebar(entries: SidebarEntry[], href: string, isCurrent: boolean): SidebarEntry[] {
  // Every generated group is partitioned, not just the first: a second renderer
  // instance would contribute another one, and dropping it silently is exactly
  // the failure this avoids.
  const generated = (findGroup(entries, API_GROUP)?.entries ?? []).filter(isGroup);
  const core: SidebarEntry[] = [];
  const modules: SidebarEntry[] = [];

  for (const entry of generated.flatMap(group => group.entries)) {
    // The `modules/` prefix is TypeDoc's, from the `src/modules/*` entry glob; it
    // is noise in a heading, so the entries are relabelled as they are sorted.
    if (entry.label.startsWith(MODULE_PREFIX))
      modules.push({ ...entry, label: entry.label.slice(MODULE_PREFIX.length) });
    else
      core.push(entry);
  }

  return [
    overviewLink(href, isCurrent),
    collapsedGroup('Core API', core),
    collapsedGroup('Modules API', modules),
  ];
}

function sectionPath(pathname: string): string {
  const base = import.meta.env.BASE_URL;
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  return path.replace(/\/$/, '');
}

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const base = import.meta.env.BASE_URL;
  const path = sectionPath(context.url.pathname);

  if (path === 'manual' || path.startsWith('manual/')) {
    route.sidebar = manualSidebar(route.sidebar, `${base}manual/`, path === 'manual');
  }
  else if (path === 'api' || path.startsWith('api/')) {
    route.sidebar = apiSidebar(route.sidebar, `${base}api/`, path === 'api');
  }
});
