"""Keep discovered main navigation distinct from contextual app surfaces."""

from copy import deepcopy


def main_tab_names(agent_memory):
    index = (agent_memory or {}).get("tab_index_map") or {}
    if not isinstance(index, dict):
        return []
    entries = sorted(index.items(), key=lambda item: int(item[0]) if str(item[0]).isdigit() else 999)
    return list(dict.fromkeys(name.strip() for _, name in entries
                              if isinstance(name, str) and name.strip()))


def normalize_navigation_roots(roots, agent_memory):
    """Merge duplicate roots and place non-tab lanes under one honest folder."""
    tabs = main_tab_names(agent_memory)
    merged = {}
    expanded = []
    for root in roots:
        if isinstance(root, dict) and root.get("id") == "other_app_surfaces":
            expanded.extend(root.get("children") or [])
        else:
            expanded.append(root)
    for source in expanded:
        if not isinstance(source, dict):
            continue
        node = deepcopy(source)
        label = str(node.get("label") or "").strip()
        if not label:
            continue
        key = label.casefold()
        if key in merged:
            previous = merged[key]
            previous["screens"] = sorted(set(previous.get("screens") or []) | set(node.get("screens") or []))
            previous["children"] = (previous.get("children") or []) + (node.get("children") or [])
            previous["canonical_lanes"] = ((previous.get("canonical_lanes") or [])
                                           + (node.get("canonical_lanes") or []))
            previous["screen_count"] = len(previous["screens"])
        else:
            merged[key] = node

    result = []
    for order, name in enumerate(tabs, 1):
        node = merged.pop(name.casefold(), None)
        if node:
            node["is_nav_tab"] = True
            node["nav_order"] = order
            result.append(node)

    other = list(merged.values())
    for node in other:
        node["is_nav_tab"] = False
        node["description"] = f"Captured {node['label']} surface; not a confirmed main navigation tab."
    if other and tabs:
        steps = sorted({step for node in other for step in node.get("screens") or []})
        result.append({
            "id": "other_app_surfaces", "label": "Other app surfaces",
            "description": "Global controls, drawers, and child pages captured outside the main tabs.",
            "is_nav_tab": False, "nav_order": len(tabs) + 1,
            "screens": steps, "screen_count": len(steps), "children": other,
        })
    else:
        result.extend(other)
    return result
