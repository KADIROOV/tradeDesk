import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleDisconnect } from '../../server/connect.js'
import { route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const POST = route(handleDisconnect, productionDeps, allowedOrigins())
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
