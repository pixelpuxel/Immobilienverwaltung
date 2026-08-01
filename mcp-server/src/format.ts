export function asText(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: asText(value)
      }
    ],
    structuredContent: asStructuredContent(value)
  };
}

export function structuredJsonContent<T extends Record<string, unknown>>(value: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: asText(value)
      }
    ],
    structuredContent: value
  };
}

export function textContent(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ],
    structuredContent: { text }
  };
}

function asStructuredContent(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { value };
}
