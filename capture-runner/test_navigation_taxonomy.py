import unittest
from processing.navigation_taxonomy import main_tab_names, normalize_navigation_roots


class NavigationTaxonomyTests(unittest.TestCase):
    def test_only_discovered_tabs_are_navigation_and_contextual_roots_are_grouped(self):
        memory = {"tab_index_map": {"1": "Saved", "0": "Home", "2": "Search"}}
        roots = [
            {"id": "home", "label": "Home", "screens": [1], "children": []},
            {"id": "search-panel", "label": "Search Panel", "screens": [2], "children": []},
            {"id": "search-panel-2", "label": "Search Panel", "screens": [3], "children": []},
            {"id": "saved", "label": "Saved", "screens": [4], "children": []},
        ]
        result = normalize_navigation_roots(roots, memory)
        self.assertEqual(main_tab_names(memory), ["Home", "Saved", "Search"])
        self.assertEqual([root["label"] for root in result],
                         ["Home", "Saved", "Other app surfaces"])
        self.assertEqual(result[0]["is_nav_tab"], True)
        self.assertEqual(result[-1]["is_nav_tab"], False)
        self.assertEqual(result[-1]["screens"], [2, 3])
        self.assertEqual(len(result[-1]["children"]), 1)
        self.assertEqual(result[-1]["children"][0]["screens"], [2, 3])
        self.assertEqual(normalize_navigation_roots(result, memory), result)


if __name__ == "__main__":
    unittest.main()
