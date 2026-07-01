import { JSONPath } from 'jsonpath-plus';

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

export default function patch(schema, relativePath) {
  if (!schema || !schema.$defs) return schema;

  // Find all definitions referenced by top-level properties
  const referencedDefs = JSONPath({
    path: '$[anyOf,oneOf,properties]..[?(@property === "$ref" && @.match(/^#/))]',
    json: schema,
  }).map(r => r.replace("#/$defs/", ""));

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
        schema.$defs[defKey].anyOf.map(item => {
          if (typeof item === 'object') {
            item.properties = item.properties || {};
            Object.assign(item.properties, visibilitySchema);
          }
        })
      } else if (Array.isArray(schema.$defs[defKey])) {
        schema.$defs[defKey].properties = schema.$defs[defKey].properties || {};
        Object.assign(schema.$defs[defKey].properties, visibilitySchema);
      }
    }
  }

  return schema;
}
