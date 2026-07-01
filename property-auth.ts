export type PropertyRole = "admin" | "user";

export type PropertyAccessProfile = {
  role: PropertyRole;
  allowedEntityIds: string[];
  allowedModules: string[];
};

export const PROPERTY_ENTITY_IDS = {
  eliane: "ent-cpf-1",
  orteconte: "ent-cnpj-1",
  saoCipriano: "ent-cnpj-2"
} as const;

export const PROPERTY_MODULES = [
  "dashboard",
  "properties",
  "people",
  "contracts",
  "finance",
  "reports",
  "expenses",
  "profits"
];

export function getPropertyAccessProfile(role: PropertyRole): PropertyAccessProfile {
  if (role === "admin") {
    return {
      role,
      allowedEntityIds: Object.values(PROPERTY_ENTITY_IDS),
      allowedModules: PROPERTY_MODULES
    };
  }

  return {
    role,
    allowedEntityIds: [PROPERTY_ENTITY_IDS.orteconte, PROPERTY_ENTITY_IDS.saoCipriano],
    allowedModules: PROPERTY_MODULES
  };
}
