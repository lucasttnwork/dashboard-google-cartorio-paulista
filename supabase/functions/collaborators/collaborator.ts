import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.2"
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"

// DTOs Zod para validação
const collaboratorSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1).max(100),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
})

const collaboratorCreateSchema = z.object({
  full_name: z.string().min(1).max(100),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
})

const collaboratorUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(50).optional(),
  position: z.string().min(1).max(50).optional(),
  is_active: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
})

const collaboratorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().regex(/^(full_name|department|position|created_at):(asc|desc)$/).optional(),
  q: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(50).optional(),
  is_active: z.coerce.boolean().optional(),
})

// Types
type Collaborator = z.infer<typeof collaboratorSchema>
type CollaboratorCreate = z.infer<typeof collaboratorCreateSchema>
type CollaboratorUpdate = z.infer<typeof collaboratorUpdateSchema>
type CollaboratorsQuery = z.infer<typeof collaboratorsQuerySchema>

// Logger interface
interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
}

// Repository Layer
export class CollaboratorRepository {
  constructor(private supabase: SupabaseClient) {}

  async findAll(query: CollaboratorsQuery): Promise<{
    data: Collaborator[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }> {
    const { page, pageSize, sort, q, department, is_active } = query
    const offset = (page - 1) * pageSize

    let baseQuery = this.supabase
      .from('collaborators')
      .select('*', { count: 'exact' })

    // Apply filters
    if (q) {
      baseQuery = baseQuery.or(`full_name.ilike.%${q}%,department.ilike.%${q}%,position.ilike.%${q}%`)
    }

    if (department) {
      baseQuery = baseQuery.eq('department', department)
    }

    if (is_active !== undefined) {
      baseQuery = baseQuery.eq('is_active', is_active)
    }

    // Apply sorting
    if (sort) {
      const [field, direction] = sort.split(':')
      baseQuery = baseQuery.order(field, { ascending: direction === 'asc' })
    } else {
      baseQuery = baseQuery.order('full_name', { ascending: true })
    }

    const { data, error, count } = await baseQuery
      .range(offset, offset + pageSize - 1)

    if (error) throw error

    const total = count || 0
    const totalPages = Math.ceil(total / pageSize)
    const hasNext = page < totalPages
    const hasPrev = page > 1

    return {
      data: data || [],
      total,
      page,
      pageSize,
      totalPages,
      hasNext,
      hasPrev,
    }
  }

  async findById(id: number): Promise<Collaborator | null> {
    const { data, error } = await this.supabase
      .from('collaborators')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data
  }

  async create(data: CollaboratorCreate): Promise<Collaborator> {
    const { data: result, error } = await this.supabase
      .from('collaborators')
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return result
  }

  async update(id: number, data: CollaboratorUpdate): Promise<Collaborator> {
    const { data: result, error } = await this.supabase
      .from('collaborators')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return result
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.supabase
      .from('collaborators')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  async getStats(): Promise<{
    total_collaborators: number
    active_collaborators: number
    inactive_collaborators: number
    top_department: string | null
  }> {
    const { data, error } = await this.supabase.rpc('get_collaborators_stats')

    if (error) throw error

    return data[0] || {
      total_collaborators: 0,
      active_collaborators: 0,
      inactive_collaborators: 0,
      top_department: null,
    }
  }
}

// Service Layer (Business Logic)
export class CollaboratorService {
  constructor(private repository: CollaboratorRepository, private supabase: SupabaseClient) {}

  async getCollaborators(query: CollaboratorsQuery) {
    return this.repository.findAll(query)
  }

  async getCollaboratorById(id: number): Promise<Collaborator | null> {
    return this.repository.findById(id)
  }

  async createCollaborator(data: CollaboratorCreate): Promise<Collaborator> {
    // Business rule: Check for duplicate names
    const existing = await this.repository.findAll({
      page: 1,
      pageSize: 1,
      q: data.full_name
    })

    if (existing.data.length > 0) {
      throw new Error('Collaborator with this name already exists')
    }

    return this.repository.create(data)
  }

  async updateCollaborator(id: number, data: CollaboratorUpdate): Promise<Collaborator> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new Error('Collaborator not found')
    }

    // Business rule: Check for duplicate names when updating
    if (data.full_name && data.full_name !== existing.full_name) {
      const duplicates = await this.repository.findAll({
        page: 1,
        pageSize: 1,
        q: data.full_name
      })

      if (duplicates.data.length > 0) {
        throw new Error('Collaborator with this name already exists')
      }
    }

    return this.repository.update(id, data)
  }

  async deleteCollaborator(id: number): Promise<void> {
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new Error('Collaborator not found')
    }

    // Business rule: Prevent deletion of collaborators with mentions
    const { count } = await this.supabase
      .from('review_collaborators')
      .select('*', { count: 'exact', head: true })
      .eq('collaborator_id', id)

    if (count && count > 0) {
      throw new Error('Cannot delete collaborator with existing mentions')
    }

    await this.repository.delete(id)
  }

  async getStats() {
    return this.repository.getStats()
  }
}

// Controller Layer
export class CollaboratorController {
  constructor(
    private service: CollaboratorService,
    private logger: Logger
  ) {}

  private createResponse<T>(data: T, requestId: string) {
    return {
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    }
  }

  private createErrorResponse(code: string, message: string, requestId: string, status = 400) {
    return {
      error: { code, message },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    }
  }

  async getCollaborators(req: Request, requestId: string): Promise<Response> {
    try {
      const url = new URL(req.url)
      const query = collaboratorsQuerySchema.parse({
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        sort: url.searchParams.get('sort'),
        q: url.searchParams.get('q'),
        department: url.searchParams.get('department'),
        is_active: url.searchParams.get('is_active'),
      })

      const result = await this.service.getCollaborators(query)

      return new Response(JSON.stringify(this.createResponse(result, requestId)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify(
          this.createErrorResponse('VALIDATION_ERROR', 'Invalid query parameters', requestId, 400)
        ), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      this.logger.error('Error fetching collaborators', { error: error.message, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to fetch collaborators', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  async getCollaboratorById(req: Request, id: number, requestId: string): Promise<Response> {
    try {
      const collaborator = await this.service.getCollaboratorById(id)

      if (!collaborator) {
        return new Response(JSON.stringify(
          this.createErrorResponse('NOT_FOUND', 'Collaborator not found', requestId, 404)
        ), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(this.createResponse(collaborator, requestId)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      this.logger.error('Error fetching collaborator', { error: error.message, id, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to fetch collaborator', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  async createCollaborator(req: Request, requestId: string): Promise<Response> {
    try {
      const body = await req.json()
      const data = collaboratorCreateSchema.parse(body)

      const collaborator = await this.service.createCollaborator(data)

      return new Response(JSON.stringify(this.createResponse(collaborator, requestId)), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify(
          this.createErrorResponse('VALIDATION_ERROR', 'Invalid input data', requestId, 400)
        ), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (error.message.includes('already exists')) {
        return new Response(JSON.stringify(
          this.createErrorResponse('CONFLICT', error.message, requestId, 409)
        ), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      this.logger.error('Error creating collaborator', { error: error.message, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to create collaborator', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  async updateCollaborator(req: Request, id: number, requestId: string): Promise<Response> {
    try {
      const body = await req.json()
      const data = collaboratorUpdateSchema.parse(body)

      const collaborator = await this.service.updateCollaborator(id, data)

      return new Response(JSON.stringify(this.createResponse(collaborator, requestId)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(JSON.stringify(
          this.createErrorResponse('VALIDATION_ERROR', 'Invalid input data', requestId, 400)
        ), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (error.message.includes('not found')) {
        return new Response(JSON.stringify(
          this.createErrorResponse('NOT_FOUND', error.message, requestId, 404)
        ), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (error.message.includes('already exists')) {
        return new Response(JSON.stringify(
          this.createErrorResponse('CONFLICT', error.message, requestId, 409)
        ), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      this.logger.error('Error updating collaborator', { error: error.message, id, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to update collaborator', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  async deleteCollaborator(req: Request, id: number, requestId: string): Promise<Response> {
    try {
      await this.service.deleteCollaborator(id)

      return new Response(JSON.stringify(this.createResponse({ deleted: true }, requestId)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (error.message.includes('not found')) {
        return new Response(JSON.stringify(
          this.createErrorResponse('NOT_FOUND', error.message, requestId, 404)
        ), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (error.message.includes('Cannot delete')) {
        return new Response(JSON.stringify(
          this.createErrorResponse('CONFLICT', error.message, requestId, 409)
        ), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      this.logger.error('Error deleting collaborator', { error: error.message, id, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to delete collaborator', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  async getStats(req: Request, requestId: string): Promise<Response> {
    try {
      const stats = await this.service.getStats()

      return new Response(JSON.stringify(this.createResponse(stats, requestId)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      this.logger.error('Error fetching stats', { error: error.message, requestId })
      return new Response(JSON.stringify(
        this.createErrorResponse('INTERNAL_ERROR', 'Failed to fetch stats', requestId, 500)
      ), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }
}
