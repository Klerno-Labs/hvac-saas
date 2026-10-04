import { z } from 'zod'

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long').refine(value => new TextEncoder().encode(value).length <= 72, 'Password is too long. Use fewer characters.')

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
  password: passwordSchema,
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
  password: z.string().min(1, 'Password is required'),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
