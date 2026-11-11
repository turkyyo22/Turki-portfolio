/**
 * A failure in an admin AI feature with a stable, lowercase code
 * (for example "translation_incomplete") that the dashboard shows a message for.
 */
export class AdminAiError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "AdminAiError";
    this.code = code;
  }
}
