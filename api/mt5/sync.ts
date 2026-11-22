import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleSync, route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleSync, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
