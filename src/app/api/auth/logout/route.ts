import { destroySession } from "@/lib/auth";
import { appUrl } from "@/lib/env";

export async function POST() {
  await destroySession();
  return Response.redirect(`${appUrl()}/login`, 303);
}
