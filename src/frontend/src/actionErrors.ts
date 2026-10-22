export function safeActionError(error: unknown, fallback = "The action could not be confirmed. Review its state before retrying.") {
  if (!(error instanceof Error) || error instanceof TypeError) return fallback;
  const message = error.message.trim();
  const controls = Array.from(message).some(character => character.codePointAt(0)! < 32 && ![9, 10, 13].includes(character.codePointAt(0)!));
  if (!message || controls || message.length > 500 || /bearer\s|-----BEGIN|(?:password|token|secret|authorization|api[_-]?key)\s*[=:]/i.test(message)) return fallback;
  return message;
}
