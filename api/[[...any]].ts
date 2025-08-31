// api/[...any].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

// Forward all /api/* requests to your Express app.
// Do NOT app.listen() in serverless.
export default function handler(req: VercelRequest, res: VercelResponse) {
  // @ts-ignore - express types differ but are runtime compatible
  return app(req, res);
}
