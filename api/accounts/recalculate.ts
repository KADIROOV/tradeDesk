import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleRecalculate, route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleRecalculate, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
