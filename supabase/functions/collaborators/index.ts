import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { getServiceClient } from "../_shared/db.ts"
import { createLogger } from "../_shared/logger.ts"
import {
  CollaboratorRepository,
  CollaboratorService,
  CollaboratorController
} from "./collaborator.ts"

const logger = createLogger('collaborators-api')

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  const startTime = Date.now()

  try {
    logger.info('Request started', {
      method: req.method,
      url: req.url,
      requestId
    })

    const supabase = getServiceClient()
    const repository = new CollaboratorRepository(supabase)
    const service = new CollaboratorService(repository, supabase)
    const controller = new CollaboratorController(service, logger)

    const url = new URL(req.url)
    const path = url.pathname.replace('/functions/v1/collaborators', '')

    let response: Response

    switch (`${req.method} ${path}`) {
      case 'GET /':
        response = await controller.getCollaborators(req, requestId)
        break
      case 'GET /stats':
        response = await controller.getStats(req, requestId)
        break
      case 'POST /':
        response = await controller.createCollaborator(req, requestId)
        break
      default:
        if (req.method === 'GET' && path.match(/^\/\d+$/)) {
          const id = parseInt(path.slice(1))
          response = await controller.getCollaboratorById(req, id, requestId)
        } else if (req.method === 'PUT' && path.match(/^\/\d+$/)) {
          const id = parseInt(path.slice(1))
          response = await controller.updateCollaborator(req, id, requestId)
        } else if (req.method === 'DELETE' && path.match(/^\/\d+$/)) {
          const id = parseInt(path.slice(1))
          response = await controller.deleteCollaborator(req, id, requestId)
        } else {
          response = new Response(JSON.stringify({
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: 'Method not allowed'
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId
            }
          }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
    }

    const duration = Date.now() - startTime
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: response.status,
      duration,
      requestId
    })

    return response

  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('Request failed', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      duration,
      requestId
    })

    return new Response(JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
