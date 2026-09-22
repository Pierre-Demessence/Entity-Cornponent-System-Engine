import { handleJobs } from '@pierre/ecs/modules/worker-pool';

import { heavyJob } from './heavy';

handleJobs<number, number>(input => heavyJob(input));
