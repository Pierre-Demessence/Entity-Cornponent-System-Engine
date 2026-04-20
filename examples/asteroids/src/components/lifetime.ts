import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Lifetime { remainingMs: number }

export const LifetimeDef: ComponentDef<Lifetime> = simpleComponent<Lifetime>(
  'lifetime',
  { remainingMs: 'number' },
);
