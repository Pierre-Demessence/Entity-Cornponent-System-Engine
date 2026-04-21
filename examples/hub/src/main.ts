import './style.css';

type Teardown = () => void;
type StartFn = (container: HTMLElement) => Teardown;
type ExampleId = 'snake' | 'asteroids' | 'platformer';

interface ExampleSpec {
  id: ExampleId;
  controls: string;
  summary: string;
  title: string;
  load: () => Promise<{ start: StartFn }>;
}

const EXAMPLES: ExampleSpec[] = [
  {
    id: 'snake',
    controls: 'Arrows/WASD move, R restart after death',
    summary: 'Arcade grid movement with event-driven growth and restart flow.',
    title: 'Snake',
    load: () => import('@pierre/ecs-example-snake/src/main.ts'),
  },
  {
    id: 'asteroids',
    controls: 'Left/Right rotate, Up thrust, Space fire, R reset',
    summary: 'Continuous motion, thrust + rotation, bullets, rock splitting.',
    title: 'Asteroids',
    load: () => import('@pierre/ecs-example-asteroids/src/main.ts'),
  },
  {
    id: 'platformer',
    controls: 'Left/Right move, Space/Up jump',
    summary: 'Side-view gravity + AABB kinematics, pickups, and respawn.',
    title: 'Platformer',
    load: () => import('@pierre/ecs-example-platformer/src/main.ts'),
  },
];

const examplesById = new Map<ExampleId, ExampleSpec>(EXAMPLES.map(spec => [spec.id, spec]));

const root = document.getElementById('root');
if (!root)
  throw new Error('Hub root element is missing');
const appRoot: HTMLElement = root;

let currentTeardown: Teardown | null = null;
let loadToken = 0;

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function setRoute(id: ExampleId | null): void {
  window.location.hash = id ? `#${id}` : '';
}

function readRoute(): ExampleId | null {
  const hash = window.location.hash.slice(1).trim();
  if (!hash)
    return null;
  if (examplesById.has(hash as ExampleId))
    return hash as ExampleId;
  return null;
}

function cleanupRunningExample(): void {
  try {
    currentTeardown?.();
  }
  catch (error) {
    console.error('Failed to teardown running example', error);
  }
  currentTeardown = null;
}

function renderLanding(): void {
  cleanupRunningExample();

  const cards = EXAMPLES.map(spec => `
    <article class="card">
      <h2>${escapeHtml(spec.title)}</h2>
      <p>${escapeHtml(spec.summary)}</p>
      <div class="controls">${escapeHtml(spec.controls)}</div>
      <p>
        <button class="button" data-example="${escapeHtml(spec.id)}" type="button">Launch</button>
      </p>
    </article>
  `).join('');

  appRoot.innerHTML = `
    <main class="app">
      <section class="header">
        <h1 class="title">ECS Example Lab</h1>
        <p class="subtitle">
          One workspace, one dev server, three intentionally different game loops using the same ECS engine.
          Choose an example to mount it directly in this page.
        </p>
        <div class="examples">${cards}</div>
      </section>
    </main>
  `;

  const launchButtons = appRoot.querySelectorAll<HTMLButtonElement>('[data-example]');
  for (const button of launchButtons) {
    button.addEventListener('click', () => {
      const id = button.dataset.example as ExampleId;
      setRoute(id);
    });
  }
}

async function renderExample(id: ExampleId): Promise<void> {
  const spec = examplesById.get(id);
  if (!spec) {
    renderLanding();
    return;
  }

  const token = ++loadToken;
  cleanupRunningExample();

  appRoot.innerHTML = `
    <main class="app">
      <section class="header">
        <h1 class="title">ECS Example Lab</h1>
      </section>
      <section class="stage-shell">
        <div class="stage-toolbar">
          <h2 class="stage-title">${spec.title}</h2>
          <button class="button" id="backToLanding" type="button">Back to landing</button>
        </div>
        <div id="exampleStage" class="stage-root"></div>
      </section>
      <p class="stage-note">Tip: each route has its own hash URL (#snake, #asteroids, #platformer).</p>
    </main>
  `;

  const stage = appRoot.querySelector<HTMLElement>('#exampleStage');
  const backButton = appRoot.querySelector<HTMLButtonElement>('#backToLanding');
  if (!stage || !backButton)
    throw new Error('Hub stage failed to render');

  backButton.addEventListener('click', () => setRoute(null));

  try {
    const module = await spec.load();
    if (token !== loadToken)
      return;
    currentTeardown = module.start(stage);
  }
  catch (error) {
    if (token !== loadToken)
      return;
    console.error(`Failed to load or start ${spec.title}`, error);
    appRoot.innerHTML = `
      <main class="app">
        <section class="header">
          <h1 class="title">ECS Example Lab</h1>
          <p class="subtitle">Could not load ${escapeHtml(spec.title)}. Check the console for details.</p>
        </section>
        <p>
          <button class="button" id="backToLanding" type="button">Back to landing</button>
        </p>
      </main>
    `;

    const backButton = appRoot.querySelector<HTMLButtonElement>('#backToLanding');
    backButton?.addEventListener('click', () => setRoute(null));
  }
}

function renderFromRoute(): void {
  const route = readRoute();
  if (!route) {
    renderLanding();
    return;
  }
  void renderExample(route);
}

window.addEventListener('hashchange', renderFromRoute);
window.addEventListener('beforeunload', cleanupRunningExample);

renderFromRoute();
