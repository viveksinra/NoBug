import { router } from '../trpc';
import { companyRouter } from './company';
import { projectRouter } from './project';
import { apiKeyRouter } from './api-key';
import { agentRouter } from './agent';
import { issueRouter } from './issue';
import { notificationRouter } from './notification';

export const appRouter = router({
  company: companyRouter,
  project: projectRouter,
  apiKey: apiKeyRouter,
  agent: agentRouter,
  issue: issueRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
