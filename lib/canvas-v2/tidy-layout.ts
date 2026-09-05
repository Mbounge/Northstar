import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from "./native-scene";
import type { CanvasV2ManualMutation } from "./manual-mutations";

type Item = { nodeId: string; locked?: boolean; bounds: { x: number; y: number; width: number; height: number } };
export function canvasV2IsSectionHeading(node: CanvasV2NativeSceneNode, scene: CanvasV2NativeSceneDocument): boolean {
  if (node.attributes["data-canvas-v2-section-title"] === "true") return true;
  const parent = scene.nodes.find(item => item.id === node.parentId);
  return parent?.attributes["data-canvas-v2-section"] === "true" && node.sourceNodeId === `${parent.sourceNodeId}-title`;
}

export function canvasV2TidyItems<T extends Item>(items: T[], scene?: CanvasV2NativeSceneDocument): T[] {
  const selected = new Set(items.map(item => item.nodeId));
  const byId = new Map(scene?.nodes.map(node => [node.id,node]));
  return items.filter(item => {
    if (item.locked || item.nodeId === "canvas") return false;
    const node = scene?.nodes.find(node => node.sourceNodeId === item.nodeId);
    if (!node || !scene) return true;
    if (canvasV2IsSectionHeading(node,scene) || node.kind === "connector") return false;
    let parent = byId.get(node.parentId ?? "");
    while (parent) { if (parent.sourceNodeId && selected.has(parent.sourceNodeId)) return false; parent = byId.get(parent.parentId ?? ""); }
    return true;
  });
}

/** Align selected content within each section; headings and other sections keep their own positions. */
export function canvasV2TidyMutation(items: Item[], scene: CanvasV2NativeSceneDocument | undefined, gapX: number, gapY: number): CanvasV2ManualMutation {
  const byId = new Map(scene?.nodes.map(node => [node.id,node]));
  const groups = new Map<string, Item[]>();
  for (const item of canvasV2TidyItems(items,scene)) {
    const node = scene?.nodes.find(node => node.sourceNodeId === item.nodeId), parent = byId.get(node?.parentId ?? "");
    const key = parent?.attributes["data-canvas-v2-section"] === "true" ? parent.id : "";
    groups.set(key,[...(groups.get(key) ?? []),item]);
  }
  const mutations: Exclude<CanvasV2ManualMutation,{kind:"batch"}>[] = [];
  for (const [sectionId, group] of groups) {
    if (group.length < 2) continue;
    const columns = Math.ceil(Math.sqrt(group.length));
    const cellWidth = Math.max(...group.map(item => item.bounds.width)), cellHeight = Math.max(...group.map(item => item.bounds.height));
    const x = Math.min(...group.map(item => item.bounds.x)), y = Math.min(...group.map(item => item.bounds.y));
    group.forEach((item,index) => mutations.push({ kind:"move",nodeId:item.nodeId,deltaX:x+index%columns*(cellWidth+gapX)-item.bounds.x,deltaY:y+Math.floor(index/columns)*(cellHeight+gapY)-item.bounds.y }));
    const section = byId.get(sectionId);
    if (section?.sourceNodeId) {
      let sx = section.geometry.x, sy = section.geometry.y, parent = byId.get(section.parentId ?? "");
      while (parent) { sx += parent.geometry.x; sy += parent.geometry.y; parent = byId.get(parent.parentId ?? ""); }
      // Grow only as needed. The selected notes never spill out or lose membership.
      const width = Math.max(section.geometry.width,x-sx+columns*cellWidth+(columns-1)*gapX+24);
      const rows = Math.ceil(group.length/columns);
      const height = Math.max(section.geometry.height,y-sy+rows*cellHeight+(rows-1)*gapY+24);
      if (width !== section.geometry.width || height !== section.geometry.height) mutations.push({ kind:"resize",nodeId:section.sourceNodeId,width,height });
    }
  }
  return { kind:"batch",label:"Tidied selected content.",mutations };
}
