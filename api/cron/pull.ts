import { allowedOrigins, productionDeps } from '../../server/deps.js'
import { handleCronPull } from '../../server/connect.js'
import { route } from '../../server/handlers.js'
import { preflight } from '../../server/http.js'

export const GET = route(handleCronPull, productionDeps, allowedOrigins(), 'GET')
export const OPTIONS = (req: Request) => preflight(req, allowedOrigins())
