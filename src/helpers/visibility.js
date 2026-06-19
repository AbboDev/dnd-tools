export const VISIBILITIES = [
  "dm",
  "player"
];

export function hasVisibility(filename, visibility) {
  for (const choice of VISIBILITIES) {
    if (choice !== visibility && (filename.includes(`.${choice}.json`) || filename.includes(`.${choice}.`))) {
      return false;
    }
  }

  return true;
}

export function filterNodeByVisibility(node, visibility) {
  if (Array.isArray(node)) {
    return node
      .filter(item => !item || !item._visibility || item._visibility.includes(visibility))
      .map(item => filterNodeByVisibility(item, visibility));
  } else if (node && typeof node === "object") {
    const copy = {};

    for (const [key, val] of Object.entries(node)) {
      if (key === "_visibility") continue;
      copy[key] = filterNodeByVisibility(val, visibility);
    }

    return copy;
  }

  return node;
}
