import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleHeartbeat, route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleHeartbeat, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
