// Verya — converts Zod v4 schemas into Gemini `Schema` objects for structured output.
// Supports the subset used by pipeline schemas: object, string, number, boolean,
// enum, array, optional, nullable, default, min/max (numbers), length checks.
// Gemini validates the shape; the same Zod schema re-validates the parsed result.

type GeminiSchema = {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZod = { _zod: { def: any } };

function readCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  check: any
): { kind: string; value?: unknown } {
  const name: string = check?.constructor?.name ?? "";
  const bag = check?._zod ?? {};
  const payload = bag?.def ?? bag;
  return { kind: name, value: payload?.value };
}

function applyChecks(
  out: GeminiSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checks: any[] | undefined,
  baseType: string
): void {
  if (!Array.isArray(checks)) return;
  for (const check of checks) {
    const { kind, value } = readCheck(check);
    if (value === undefined || value === null) continue;
    const n = Number(value);
    if (Number.isNaN(n)) continue;
    if (kind.includes("GreaterThan")) out.minimum = n; // '>=' or '>' — Gemini has no exclusive bound
    else if (kind.includes("LessThan")) out.maximum = n;
    else if (kind.includes("MinLength")) {
      if (baseType === "array") out.minItems = n;
      else out.minLength = n;
    } else if (kind.includes("MaxLength")) {
      if (baseType === "array") out.maxItems = n;
      else out.maxLength = n;
    } else if (kind.includes("ExactLength")) {
      if (baseType === "array") {
        out.minItems = n;
        out.maxItems = n;
      } else {
        out.minLength = n;
        out.maxLength = n;
      }
    }
  }
}

export function zodToGeminiSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: AnyZod | any
): GeminiSchema {
  const def = input?._zod?.def ?? {};
  const wrapperType: string | undefined = def.type;

  // Unwrap containers that only affect optionality, then recurse.
  if (wrapperType === "optional" || wrapperType === "default" || wrapperType === "prefault") {
    const inner = zodToGeminiSchema(def.innerType);
    return { ...inner, nullable: true };
  }
  if (wrapperType === "nullable") {
    const inner = zodToGeminiSchema(def.innerType);
    return { ...inner, nullable: true };
  }

  switch (wrapperType) {
    case "string": {
      const out: GeminiSchema = { type: "STRING" };
      applyChecks(out, def.checks, "string");
      return out;
    }
    case "number": {
      const out: GeminiSchema = { type: "NUMBER", format: "double" };
      applyChecks(out, def.checks, "number");
      return out;
    }
    case "int": {
      const out: GeminiSchema = { type: "INTEGER" };
      applyChecks(out, def.checks, "number");
      return out;
    }
    case "boolean":
      return { type: "BOOLEAN" };
    case "enum": {
      const values: string[] = Object.keys(def.entries ?? {});
      return { type: "STRING", enum: values };
    }
    case "literal":
      return { type: "STRING", enum: [String(def.values ?? def.value)] };
    case "array": {
      const out: GeminiSchema = { type: "ARRAY", items: zodToGeminiSchema(def.element) };
      applyChecks(out, def.checks, "array");
      return out;
    }
    case "object": {
      const shape = def.shape ?? {};
      const properties: Record<string, GeminiSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const child = zodToGeminiSchema(value);
        properties[key] = child;
        const childDef = (value as AnyZod)?._zod?.def ?? {};
        const isOptional =
          childDef.type === "optional" || childDef.type === "default" || childDef.type === "prefault";
        if (!isOptional) required.push(key);
      }
      const out: GeminiSchema = { type: "OBJECT", properties, propertyOrdering: Object.keys(properties) };
      if (required.length > 0) out.required = required;
      return out;
    }
    case "union": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any[] = def.options ?? [];
      const literals = options.filter((o) => o?._zod?.def?.type === "literal");
      if (literals.length === options.length && literals.length > 0) {
        return { type: "STRING", enum: literals.map((o) => String(o._zod.def.values ?? o._zod.def.value)) };
      }
      const enums = options.filter((o) => o?._zod?.def?.type === "enum");
      if (enums.length === options.length && enums.length > 0) {
        const values = enums.flatMap((o) => Object.keys(o._zod.def.entries ?? {}));
        return { type: "STRING", enum: [...new Set(values)] };
      }
      // Fallback: first option (pipeline schemas avoid non-literal unions).
      return zodToGeminiSchema(options[0]);
    }
    default:
      // Last resort: permissive string.
      return { type: "STRING" };
  }
}
