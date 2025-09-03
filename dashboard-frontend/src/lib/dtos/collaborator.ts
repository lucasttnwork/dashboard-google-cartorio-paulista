import { z } from 'zod'

// Base schemas
export const collaboratorSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1).max(100),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
})

export const collaboratorCreateSchema = z.object({
  full_name: z.string().min(1).max(100),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
})

export const collaboratorUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
})

// Query parameters
export const collaboratorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().regex(/^(full_name|department|position|created_at):(asc|desc)$/).optional(),
  q: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(50).optional(),
  is_active: z.coerce.boolean().optional(),
})

export const collaboratorIdSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// Response schemas
export const collaboratorResponseSchema = collaboratorSchema

export const collaboratorsListResponseSchema = z.object({
  data: z.array(collaboratorResponseSchema),
  meta: z.object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalPages: z.number().int().min(0),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
})

export const collaboratorCreateResponseSchema = collaboratorResponseSchema

export const collaboratorUpdateResponseSchema = collaboratorResponseSchema

// Error response
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  data: z.null().optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string().uuid(),
  }),
})

// Success response wrapper
export const successResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  data: dataSchema,
  error: z.null().optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string().uuid(),
  }),
})

// Types
export type Collaborator = z.infer<typeof collaboratorSchema>
export type CollaboratorCreate = z.infer<typeof collaboratorCreateSchema>
export type CollaboratorUpdate = z.infer<typeof collaboratorUpdateSchema>
export type CollaboratorsQuery = z.infer<typeof collaboratorsQuerySchema>
export type CollaboratorId = z.infer<typeof collaboratorIdSchema>
export type CollaboratorsListResponse = z.infer<typeof collaboratorsListResponseSchema>
export type CollaboratorCreateResponse = z.infer<typeof collaboratorCreateResponseSchema>
export type CollaboratorUpdateResponse = z.infer<typeof collaboratorUpdateResponseSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>
