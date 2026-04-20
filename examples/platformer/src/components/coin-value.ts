import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface CoinValue { score: number }

export const CoinValueDef: ComponentDef<CoinValue> = simpleComponent<CoinValue>(
  'coinValue',
  { score: 'number' },
);
