import { JOB_STATUSES, type JobStatus } from '@/lib/validations/job'

/**
 * Shared types for the offline-first field/technician surface.
 *
 * These DTOs are the contract between the JSON API (`/api/field/*`), the
 * service-worker cache, and the client outbox. They are intentionally
 * framework-free and prisma-free so they can be imported from both server
 * routes and client components without pulling server-only modules.
 */

export type FieldJobStatus = JobStatus

export interface FieldJobNoteDTO {
  id: string
  clientId: string
  jobId: string
  authorId: string
  authorName: string | null
  body: string
  /** True when the note was authored offline and not yet confirmed by the server. */
  pending: boolean
  createdAt: string
}

export interface FieldJobDTO {
  id: string
  organizationId: string
  customerId: string
  title: string
  status: FieldJobStatus
  scheduledFor: string | null
  completedAt: string | null
  technicianName: string | null
  customerName: string
  customerPhone: string | null
  customerAddress: string | null
  notes: FieldJobNoteDTO[]
  updatedAt: string
}

/** A single queued mutation in the client outbox. */
export type OutboxMutation =
  | {
      type: 'status'
      clientId: string
      jobId: string
      status: FieldJobStatus
      occurredAt: string
      createdAt: number
    }
  | {
      type: 'note'
      clientId: string
      jobId: string
      body: string
      occurredAt: string
      createdAt: number
    }

export type OutboxStatus = 'pending' | 'syncing' | 'error'

export interface OutboxEntry {
  id: string
  mutation: OutboxMutation
  status: OutboxStatus
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

/** Per-mutation result returned by POST /api/field/sync. */
export type SyncResult =
  | { clientId: string; ok: true; noteId?: string }
  | { clientId: string; ok: false; error: string }

export const FIELD_JOB_STATUSES = JOB_STATUSES
