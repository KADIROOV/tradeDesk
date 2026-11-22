import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleKeys, route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleKeys, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
