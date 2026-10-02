import unittest
import importlib.util
from pathlib import Path

module_path = Path(__file__).parent / "agents" / "social_researcher.py"
spec = importlib.util.spec_from_file_location("northstar_social_researcher", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SocialResearcher = module.SocialResearcher


class PersonEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.researcher = SocialResearcher.__new__(SocialResearcher)

    def test_only_direct_linkedin_member_urls_are_accepted(self):
        self.assertEqual(self.researcher.linkedin_person_url(
            "https://www.linkedin.com/in/jane-doe/?trk=people"),
            "https://www.linkedin.com/in/jane-doe")
        for url in ("https://www.linkedin.com/company/example/",
                    "https://linkedin.com/search/results/people/",
                    "http://www.linkedin.com/in/jane-doe",
                    "https://linkedin.com.evil.test/in/jane-doe"):
            self.assertIsNone(self.researcher.linkedin_person_url(url))

    def test_profile_title_must_match_selected_person(self):
        self.assertTrue(self.researcher.person_name_matches_page(
            "Jane Doe", "Jane Doe - Chief Executive Officer - LinkedIn"))
        self.assertFalse(self.researcher.person_name_matches_page(
            "Babbel", "Jasmin Lissitsin - LinkedIn"))
        self.assertFalse(self.researcher.person_name_matches_page(
            "Jane Doe", "Sign in | LinkedIn"))


if __name__ == "__main__":
    unittest.main()
