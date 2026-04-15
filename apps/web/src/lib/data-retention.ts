/**
 * Data Retention Utilities
 *
 * Functions for GDPR-compliant data cleanup:
 * - Expired QuickCaptures
 * - Old recordings past retention period
 * - Anonymization of old closed issues
 */

import type { PrismaClient } from '@nobug/db';

/**
 * Delete QuickCaptures that have passed their expires_at timestamp.
 * Returns count of deleted records.
 */
export async function cleanupExpiredCaptures(
  db: PrismaClient,
): Promise<number> {
  const result = await db.quickCapture.deleteMany({
    where: {
      expires_at: {
        not: null,
        lt: new Date(),
      },
    },
  });
  return result.count;
}

/**
 * Delete recordings older than `maxAgeDays` for a given company.
 * Follows the project -> issue -> recording chain to scope by company.
 * Also deletes orphan recordings (no issue) uploaded by company members.
 * Returns count of deleted records.
 */
export async function cleanupOldRecordings(
  db: PrismaClient,
  companyId: string,
  maxAgeDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // Get all project IDs for this company
  const projects = await db.project.findMany({
    where: { company_id: companyId },
    select: { id: true },
  });
  const projectIds = projects.map((p: { id: string }) => p.id);

  if (projectIds.length === 0) return 0;

  // Get all issue IDs for these projects
  const issues = await db.issue.findMany({
    where: { project_id: { in: projectIds } },
    select: { id: true },
  });
  const issueIds = issues.map((i: { id: string }) => i.id);

  // Delete old recordings linked to company issues
  const result = await db.recording.deleteMany({
    where: {
      created_at: { lt: cutoffDate },
      issue_id: { in: issueIds },
    },
  });

  return result.count;
}

/**
 * Anonymize closed issues older than `maxAgeDays` by setting reporter_id to "DELETED".
 * Only affects issues in CLOSED status within the given company's projects.
 * Returns count of affected records.
 */
export async function anonymizeClosedIssues(
  db: PrismaClient,
  companyId: string,
  maxAgeDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // Get all project IDs for this company
  const projects = await db.project.findMany({
    where: { company_id: companyId },
    select: { id: true },
  });
  const projectIds = projects.map((p: { id: string }) => p.id);

  if (projectIds.length === 0) return 0;

  const result = await db.issue.updateMany({
    where: {
      project_id: { in: projectIds },
      status: 'CLOSED',
      closed_at: {
        not: null,
        lt: cutoffDate,
      },
      // Only anonymize issues that haven't already been anonymized
      reporter_id: { not: 'DELETED' },
    },
    data: {
      reporter_id: 'DELETED',
      reporter_type: 'SYSTEM',
    },
  });

  return result.count;
}
