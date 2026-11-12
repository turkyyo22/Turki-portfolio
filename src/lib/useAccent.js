import { useSyncExternalStore } from "react";

import { DEFAULT_ACCENT, currentAccent, onAccentChange } from "@/lib/accent";

/**
 * The id of the accent colour on the page ("cyan", "purple", …), updated when the
 * visitor picks another. The server always renders the default; a saved colour
 * takes over straight after hydration.
 */
export function useAccent() {
  return useSyncExternalStore(onAccentChange, currentAccent, () => DEFAULT_ACCENT);
}
