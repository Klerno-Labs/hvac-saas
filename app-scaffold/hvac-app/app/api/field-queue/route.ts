import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { updateJobStatusSchema } from '@/lib/validations/job'
import { recordProofOfWorkSchema } from '@/lib/validations/proof-of-work'
import { z } from 'zod'

const jobStatusWriteSchema = z.object({
  type: z.literal('job_status'),
  jobId: z.string().min(1),
  status: z.string(),
})

const jobNotesWriteSchema = z.object({
  type: z.literal('job_notes'),
  jobId: z.string().min(1),
  workSummary: z.string().min(1),
  materialsUsed: z.string().optional(),
  completionNotes: z.string().optional(),
  technicianName: z.string().optional(),
})

const fieldWriteSchema = z.discriminatedUnion('type', [jobStatusWriteSchema, jobNotesWriteSchema])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = fieldWriteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const write = parsed.data
  const { organizationId } = membership

  const job = await db.job.findFirst({ where: { id: write.jobId, organizationId } })
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (write.type === 'job_status') {
    const statusParsed = updateJobStatusSchema.safeParse({ status: write.status })
    if (!statusParsed.success) {
      return NextResponse.json({ error: statusParsed.error.errors[0].message }, { status: 400 })
    }
    const { status } = statusParsed.data
    await db.job.update({
      where: { id: job.id },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : job.completedAt,
      },
    })
  } else {
    const notesParsed = recordProofOfWorkSchema.safeParse({
      workSummary: write.workSummary,
      materialsUsed: write.materialsUsed,
      completionNotes: write.completionNotes,
      technicianName: write.technicianName,
    })
    if (!notesParsed.success) {
      return NextResponse.json({ error: notesParsed.error.errors[0].message }, { status: 400 })
    }
    const data = notesParsed.data
    await db.job.update({
      where: { id: job.id },
      data: {
        workSummary: data.workSummary,
        materialsUsed: data.materialsUsed || null,
        completionNotes: data.completionNotes || null,
        technicianName: data.technicianName || job.technicianName,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
