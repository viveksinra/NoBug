import { router } from '../trpc';
import { companyRouter } from './company';
import { projectRouter } from './project';
import { apiKeyRouter } from './api-key';
import { agentRouter } from './agent';
import { issueRouter } from './issue';
import { notificationRouter } from './notification';
import { quickCaptureRouter } from './quick-capture';
import { regressionRouter } from './regression';
import { invitationRouter } from './invitation';
import { regressionRunRouter } from './regression-run';

export const appRouter = router({
  company: companyRouter,
  project: projectRouter,
  apiKey: apiKeyRouter,
  agent: agentRouter,
  issue: issueRouter,
  notification: notificationRouter,
  quickCapture: quickCaptureRouter,
  regression: regressionRouter,
  invitation: invitationRouter,
  regressionRun: regressionRunRouter,
});

export type AppRouter = typeof appRouter;
