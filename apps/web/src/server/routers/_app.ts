import { router } from '../trpc';
import { companyRouter } from './company';
import { projectRouter } from './project';

export const appRouter = router({
  company: companyRouter,
  project: projectRouter,
});

export type AppRouter = typeof appRouter;
