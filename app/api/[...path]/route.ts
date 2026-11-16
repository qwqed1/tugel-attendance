import { handle } from '@/lib/server/api';

type Ctx = RouteContext<'/api/[...path]'>;
const h = async (req: Request, ctx: Ctx) => handle(req, (await ctx.params).path);

export { h as GET, h as POST, h as PUT, h as PATCH, h as DELETE };
