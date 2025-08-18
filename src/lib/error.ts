export function isEnoent(error: unknown): error is Error & {code: "ENOENT"} {
  return isSystemError(error) && error.code === "ENOENT";
}

export function isSystemError(error: unknown): error is Error & {code: string} {
  return error instanceof Error && "code" in error;
}
