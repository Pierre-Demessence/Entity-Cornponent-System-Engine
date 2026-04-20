import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface RockTier { tier: number }

export const RockTierDef: ComponentDef<RockTier> = simpleComponent<RockTier>(
  'rockTier',
  { tier: 'number' },
);
