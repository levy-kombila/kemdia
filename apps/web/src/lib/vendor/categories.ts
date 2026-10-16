import type { CategoryNode } from "@kemdia/contracts";
import type { CategoryOption } from "@/components/vendor/ProductForm";

/**
 * Catégories proposées au vendeur (S6-T06) : toutes, rangées par catégorie principale, avec leur chemin lisible
 * (« Mode › Pagnes »). L'API accepte toute catégorie du catalogue et revérifie qu'elle existe.
 */
export function categoryOptions(tree: readonly CategoryNode[]): CategoryOption[] {
  const options: CategoryOption[] = [];
  const walk = (nodes: readonly CategoryNode[], trail: string[], group: string) => {
    for (const node of nodes) {
      const path = [...trail, node.name];
      options.push({ id: node.id, label: path.slice(1).join(" › ") || node.name, group });
      walk(node.children, path, group);
    }
  };
  for (const root of tree) walk([root], [], root.name);
  return options;
}

/** Chemin lisible d'une catégorie, ou `null`. */
export function categoryLabel(tree: readonly CategoryNode[], id: string): string | null {
  const walk = (nodes: readonly CategoryNode[], trail: string[]): string | null => {
    for (const node of nodes) {
      const here = [...trail, node.name];
      if (node.id === id) return here.join(" › ");
      const found = walk(node.children, here);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []);
}
