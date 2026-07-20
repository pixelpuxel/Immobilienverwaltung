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
    ]
  };
}

export function textContent(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}
