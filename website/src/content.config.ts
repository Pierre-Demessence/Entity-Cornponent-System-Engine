import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';

// Starlight does not register its own collection: without this, `docs` is empty
// and every generated page is silently ignored.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
