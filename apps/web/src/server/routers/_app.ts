import { router } from '../trpc';
import { companyRouter } from './company';
import { projectRouter } from './project';
import { apiKeyRouter } from './api-key';
import { agentRouter } from './agent';
import { issueRouter } from './issue';

export const appRouter = router({
  company: companyRouter,
  project: projectRouter,
  apiKey: apiKeyRouter,
  agent: agentRouter,
  issue: issueRouter,
});

export type AppRouter = typeof appRouter;
