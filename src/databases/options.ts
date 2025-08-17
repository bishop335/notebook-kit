function optional<T>(type: (value: unknown) => T): (value: unknown) => T | undefined {
  return (value) => (value == null ? undefined : type(value));
}

export const optionalString = optional(String);
export const optionalNumber = optional(Number);
export const optionalBoolean = optional(Boolean);
