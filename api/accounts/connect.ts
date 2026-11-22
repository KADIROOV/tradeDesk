import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleConnect } from '../../server/connect.js'
import { route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleConnect, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
