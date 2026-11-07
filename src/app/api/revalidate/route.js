import { revalidatePath, revalidateTag } from "next/cache";

import { ASSISTANT_TAG } from "@/lib/assistant/limits";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { CONTENT_TAG } from "@/lib/server/content";

const SCOPES = {
  content: [CONTENT_TAG],
  assistant: [ASSISTANT_TAG],
  all: [CONTENT_TAG, ASSISTANT_TAG],
};

/**
 * Called by the admin dashboard after a save, so visitors see the change on
 * their next page load instead of after the cache window expires.
 */
export async function POST(request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let scope = "all";
  try {
    scope = (await request.json())?.scope || "all";
  } catch {
    // An empty body means "refresh everything".
  }
  const tags = SCOPES[scope];
  if (!tags) return Response.json({ error: "invalid_scope" }, { status: 400 });

  // `expire: 0` makes the next request wait for fresh data instead of serving the old page once more.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  if (tags.includes(CONTENT_TAG)) {
    revalidatePath("/en");
    revalidatePath("/ar");
  }

  return Response.json({ revalidated: tags, at: new Date().toISOString() });
}
