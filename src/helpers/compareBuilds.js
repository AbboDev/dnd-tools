export function flattenEntities(data) {
  const entities = [];

  for (const key of Object.keys(data)) {
    if (key === "_meta") continue;
    for (const entry of data[key] || []) {
      entities.push(`${key}:${entry.name}:${entry.source}`);
    }
  }

  return entities;
}

export function compareBuilds(oldBuild, newBuild) {
  const oldFlat = flattenEntities(oldBuild);
  const newFlat = flattenEntities(newBuild);

  const oldSet = new Set(oldFlat);
  const newSet = new Set(newFlat);

  let added = 0;
  let removed = 0;

  for (const e of newSet) {
    if (!oldSet.has(e)) added++;
  }

  for (const e of oldSet) {
    if (!newSet.has(e)) removed++;
  }

  if (removed > 0) return "major";
  if (added > 0) return "minor";

  return "patch";
}
