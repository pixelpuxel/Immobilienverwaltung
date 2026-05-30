type PropertyAddress = {
  address?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

type PropertyAddressInput = Partial<Record<"address" | "street" | "houseNumber" | "postalCode" | "city" | "country", unknown>>;

export function formatPropertyAddress(property: PropertyAddress) {
  const streetLine = [property.street, property.houseNumber].map(clean).filter(Boolean).join(" ");
  const cityLine = [property.postalCode, property.city].map(clean).filter(Boolean).join(" ");
  const structured = [streetLine, cityLine].filter(Boolean).join(", ");
  return structured || clean(property.address) || "";
}

export function normalizePropertyAddressInput<T extends PropertyAddressInput>(data: T, current?: PropertyAddress) {
  const normalized = { ...data };
  const hasStructuredField = ["street", "houseNumber", "postalCode", "city", "country"].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  if (hasStructuredField && !Object.prototype.hasOwnProperty.call(data, "address")) {
    const formatted = formatPropertyAddress({
      street: field(data.street, current?.street),
      houseNumber: field(data.houseNumber, current?.houseNumber),
      postalCode: field(data.postalCode, current?.postalCode),
      city: field(data.city, current?.city),
      address: ""
    });
    if (formatted) normalized.address = formatted as T["address"];
  }
  return normalized;
}

function clean(value?: string | null) {
  return value?.trim() || "";
}

function field(value: unknown, fallback?: string | null) {
  return typeof value === "string" ? value : fallback;
}
