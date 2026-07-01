const visibilitySchema = {
  "_visibility": {
    "type": "array",
    "items": {
      "enum": [
        "dm",
        "player"
      ]
    }
  }
};

export default function patch(schema) {
  if (!schema || !schema.$defs) return schema;

  // Find all definitions referenced by top-level properties
  const referencedDefs = [];
  if (schema.properties) {
    for (const propVal of Object.values(schema.properties)) {
      if (propVal.$ref && propVal.$ref.startsWith("#/$defs/")) {
        referencedDefs.push(propVal.$ref.replace("#/$defs/", ""));
      } else if (propVal.items?.$ref?.startsWith("#/$defs/")) {
        referencedDefs.push(propVal.items.$ref.replace("#/$defs/", ""));
      }
    }
  }

  // Fallback: any object definition under $defs
  if (referencedDefs.length === 0) {
    for (const [defKey, defVal] of Object.entries(schema.$defs)) {
      if (defVal && defVal.type === "object") {
        referencedDefs.push(defKey);
      }
    }
  }

  // Inject _visibility into each target definition
  for (const defKey of referencedDefs) {
    if (schema.$defs[defKey]) {
      if (typeof schema.$defs[defKey] === 'object' && 'anyOf' in schema.$defs[defKey]) {
        for (const item of schema.$defs[defKey].anyOf) {
          if (typeof item === 'object') {
            item.properties = item.properties || {};
            item.properties._visibility = visibilitySchema;
          }
        }
      } else if (Array.isArray(schema.$defs[defKey])) {
        schema.$defs[defKey].properties = schema.$defs[defKey].properties || {};
        schema.$defs[defKey].properties._visibility = visibilitySchema;
      }
    }
  }

  return schema;
}
