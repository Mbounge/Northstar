


import asyncio
import json
import os
import time
import re
import random
from playwright.async_api import async_playwright
from google import genai
from google.genai import types

# --- CONFIGURATION ---
API_KEYS = [value.strip() for value in os.environ.get("NORTHSTAR_MARKETING_GEMINI_KEYS", "").split(",") if value.strip()]

COMPANY_NAME = os.environ.get("NORTHSTAR_MARKETING_COMPANY", "").strip()
MANUAL_URLS = json.loads(os.environ.get("NORTHSTAR_MARKETING_SOCIALS_JSON", "{}"))
ROSTER_FILE = os.environ.get("NORTHSTAR_MARKETING_ROSTER_FILE", f"data/{COMPANY_NAME}_omni_roster.json")
OUTPUT_DIR = os.environ.get("NORTHSTAR_MARKETING_RESEARCH_DIR", f"data/targets_{COMPANY_NAME}")
LINKEDIN_CDP_URL = os.environ.get("NORTHSTAR_MARKETING_CDP_URL", "http://127.0.0.1:9222")

MODEL_ROSTER = ["gemini-3.1-flash-lite"] # Adjust to your preferred model

# ------------------------------------------------------------------
# FIVE-MINUTE RUN PROFILE
# ------------------------------------------------------------------
# Goal: keep the researcher under ~5 minutes by limiting deep discovery.
# LinkedIn roster creation remains the priority. X is lite. IG people hunt is off by default.
MAX_RUNTIME_SECONDS = int(os.environ.get("NORTHSTAR_MARKETING_RESEARCH_SECONDS", "300"))

TARGET_PEOPLE_COUNT = 15
MAX_X_SEARCHES = 3
MAX_IG_SEARCHES = 0

LINKEDIN_SCROLL_CYCLES = 12
PROFILE_SCREENSHOTS_PER_PERSON = 1

ENABLE_X_HUNT = True
ENABLE_INSTAGRAM_HUNT = False

# Multiplies all artificial sleeps. 0.30 means a 10 sec pause becomes ~3 sec.
DELAY_SCALE = 0.30
ENABLE_RANDOM_RESTS = False

# Prevent one bad model/API call from eating the whole 5-minute run.
MAX_AI_ROUNDS_PER_PROMPT = 2
AI_ERROR_SLEEP_SECONDS = 0.75

# Browser navigation caps.
NAV_TIMEOUT_MS = 15000

# To reliably select 15 VIPs, load more than 15 visible employees first.
MIN_EMPLOYEE_POOL = 35
MAX_EMPTY_SCROLL_CYCLES = 2


class SocialResearcher:
    def __init__(self):
        self.api_keys = API_KEYS
        self.current_key_index = 0
        self.client = genai.Client(api_key=self.api_keys[0]) if self.api_keys else None
        self.started_at = time.time()

        self.session_dir = OUTPUT_DIR
        self.screenshots_dir = f"{self.session_dir}/screenshots"
        self.profiles_dir = f"{self.screenshots_dir}/profiles"
        self.twitter_dir = f"{self.screenshots_dir}/twitter"
        self.ig_dir = f"{self.screenshots_dir}/instagram"

        for d in [self.screenshots_dir, self.profiles_dir, self.twitter_dir, self.ig_dir]:
            os.makedirs(d, exist_ok=True)

        self.roster = []
        self.found_brand_handles = MANUAL_URLS.copy()
        self.vip_candidates = []
        self.total_employee_count = None

    # ------------------------------------------------------------------
    # TIME BUDGET HELPERS
    # ------------------------------------------------------------------
    def elapsed_seconds(self):
        return time.time() - self.started_at

    def time_left(self):
        return MAX_RUNTIME_SECONDS - self.elapsed_seconds()

    def out_of_time(self, reserve_seconds=0):
        return self.time_left() <= reserve_seconds

    def budget_status(self):
        return f"{max(0, int(self.time_left()))}s left"

    # ------------------------------------------------------------------
    # AI & UTILITY HELPERS
    # ------------------------------------------------------------------
    def rotate_key(self):
        if not self.api_keys:
            return
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        print("      🔄 Switching API Key...")
        self.client = genai.Client(api_key=self.api_keys[self.current_key_index])

    def clean_json(self, text):
        text = text.strip()
        text = re.sub(r'^```json\s*|```$', '', text, flags=re.MULTILINE)
        return text.strip()

    async def generate_robust(self, prompt, images=None, default=None):
        """Bounded Gemini helper. Returns default/{} instead of retrying forever."""
        if self.client is None:
            return default if default is not None else {}
        contents = [prompt]
        if images:
            if not isinstance(images, list):
                images = [images]
            for img in images:
                if img:
                    contents.append(types.Part.from_bytes(data=img, mime_type="image/jpeg"))

        for round_idx in range(MAX_AI_ROUNDS_PER_PROMPT):
            if self.out_of_time(20):
                print("      ⏱️ Skipping AI call; time budget nearly exhausted.")
                return default if default is not None else {}

            for model_name in MODEL_ROSTER:
                try:
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    if response.text:
                        return json.loads(self.clean_json(response.text))
                except Exception as e:
                    error_str = str(e).lower()
                    if "429" in error_str or "quota" in error_str:
                        self.rotate_key()
                    else:
                        print(f"      ⚠️ Model Error ({model_name}): {str(e)[:80]}...")
                    time.sleep(AI_ERROR_SLEEP_SECONDS)

        return default if default is not None else {}

    # ------------------------------------------------------------------
    # FASTER HUMANIZATION HELPERS
    # ------------------------------------------------------------------
    async def human_delay(self, min_sec=4.0, max_sec=10.0):
        await asyncio.sleep(random.uniform(min_sec, max_sec) * DELAY_SCALE)

    async def random_rest(self):
        if not ENABLE_RANDOM_RESTS:
            return
        if random.random() < 0.05:
            rest_time = random.uniform(6.0, 12.0) * DELAY_SCALE
            print(f"      ☕ Short rest for {rest_time:.1f} seconds...")
            await asyncio.sleep(rest_time)

    async def smooth_scroll(self, page, direction="down", distance=800):
        chunks = random.randint(4, 8)
        chunk_size = distance / chunks
        for _ in range(chunks):
            scroll_val = chunk_size + random.uniform(-20, 20)
            if direction == "up":
                scroll_val = -scroll_val
            await page.evaluate(f"window.scrollBy(0, {scroll_val})")
            await asyncio.sleep(random.uniform(0.05, 0.18) * DELAY_SCALE)
        await self.random_rest()

    async def human_click(self, locator):
        await locator.scroll_into_view_if_needed()
        await locator.hover()
        await asyncio.sleep(random.uniform(0.2, 0.6) * DELAY_SCALE)
        await locator.click()

    async def human_type(self, locator, text):
        await locator.click()
        await asyncio.sleep(random.uniform(0.2, 0.5) * DELAY_SCALE)
        for char in text:
            await locator.type(char, delay=random.randint(30, 120))
        await asyncio.sleep(random.uniform(0.2, 0.5) * DELAY_SCALE)

    async def simulate_human(self, page):
        viewport = page.viewport_size
        if not viewport:
            return
        for _ in range(random.randint(1, 3)):
            x = random.randint(120, max(121, viewport['width'] - 120))
            y = random.randint(120, max(121, viewport['height'] - 120))
            await page.mouse.move(x, y, steps=random.randint(8, 18))
            await asyncio.sleep(random.uniform(0.08, 0.25) * DELAY_SCALE)

    async def human_check(self, page):
        try:
            page_text = await page.locator("body").inner_text(timeout=2500)
            if any(i in page_text.lower() for i in ["captcha", "robot", "unusual traffic"]):
                print("\n🛑 BOT/CAPTCHA DETECTED")
                print("👉 Clear it manually in the live browser, then press ENTER here. The 5-minute budget cannot be guaranteed during manual intervention.")
                await asyncio.get_event_loop().run_in_executor(None, input)
                print("✅ Resuming...")
                await page.wait_for_timeout(1000)
        except Exception:
            pass

    async def fast_goto(self, page, url):
        await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


    # ------------------------------------------------------------------
    # LINKEDIN EMPLOYEE PARSING HELPERS
    # ------------------------------------------------------------------
    def score_employee_text(self, text):
        """Heuristic fallback when the AI returns fewer than TARGET_PEOPLE_COUNT."""
        t = (text or "").lower()
        score = 0
        weights = [
            (r"\bfounder\b|co-founder|cofounder", 120),
            (r"\bceo\b|chief executive", 115),
            (r"\bpresident\b", 105),
            (r"\bchief\b|\bcfo\b|\bcoo\b|\bcto\b|\bcmo\b|\bcro\b|\bcpo\b", 100),
            (r"\bvp\b|vice president", 90),
            (r"\bhead of\b|\bhead,\b|\bhead\b", 85),
            (r"\bdirector\b", 70),
            (r"\blead\b|\bprincipal\b", 55),
            (r"\bmanager\b", 40),
            (r"growth|revenue|sales|partnership|product|engineering|marketing|talent|people|operations|payments|finance", 20),
        ]
        for pattern, value in weights:
            if re.search(pattern, t):
                score += value
        # Penalize weak/non-person entries.
        if any(x in t for x in ["followers", "jobs", "company page", "promoted"]):
            score -= 25
        return score

    def parse_employee_card(self, url, text):
        parts = [p.strip() for p in (text or "").split("|") if p.strip()]
        junk = re.compile(r"^(1st|2nd|3rd|premium|follow|connect|message|view|open|see more|shared connection|\d+[\d,]* followers?)", re.I)
        clean = [p for p in parts if not junk.search(p)]
        name = clean[0] if clean else "Unknown"
        role = "Unknown"
        for part in clean[1:]:
            if len(part) > 3 and not re.search(r"associated members|employees|followers", part, re.I):
                role = part
                break
        return {
            "name": name[:120],
            "role": role[:180],
            "profile_url": url,
            "_score": self.score_employee_text(text),
        }

    def fallback_vip_candidates(self, unique_employees, existing=None):
        existing = existing or []
        seen_urls = {c.get("profile_url") for c in existing if c.get("profile_url")}
        candidates = []
        for url, text in unique_employees.items():
            if url in seen_urls:
                continue
            parsed = self.parse_employee_card(url, text)
            if parsed["name"] == "Unknown":
                continue
            candidates.append(parsed)
        candidates.sort(key=lambda c: c.get("_score", 0), reverse=True)
        out = []
        for c in candidates:
            c.pop("_score", None)
            out.append(c)
        return out

    async def count_loaded_employee_profiles(self, page):
        js = """
        () => {
            const links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
            const urls = new Set();
            for (const a of links) {
                const href = (a.href || '').split('?')[0];
                if (href.includes('/in/')) urls.add(href);
            }
            return urls.size;
        }
        """
        try:
            return await page.evaluate(js)
        except Exception:
            return 0

    # ------------------------------------------------------------------
    # PART 1: LINKEDIN VIA REAL BROWSER (CDP)
    # ------------------------------------------------------------------
    async def extract_direct_employees(self, page):
        print("\n--- Phase 1: LinkedIn Direct Employee Extraction (5-Minute Mode) ---")
        company_url = self.found_brand_handles['linkedin']
        people_url = company_url.rstrip("/") + "/people/"
        print(f"   🚶 Navigating to {people_url}")

        await self.fast_goto(page, people_url)
        await self.human_delay(2, 4)
        await self.simulate_human(page)

        print("   📊 Extracting total employee count...")
        js_get_count = """
        () => {
            let match = document.body.innerText.match(/([\\d,]+)\\s+associated members/i);
            if (!match) {
                match = document.body.innerText.match(/\\n([\\d,]+)\\s+employees\\b/i);
            }
            return match ? match[1].replace(/,/g, '') : null;
        }
        """
        self.total_employee_count = await page.evaluate(js_get_count)
        if self.total_employee_count:
            print(f"      ✅ Total employees found: {self.total_employee_count}")
        else:
            print("      ⚠️ Could not find exact employee count on page.")

        print(f"   📜 Fast-loading employees until at least {MIN_EMPLOYEE_POOL} profiles are visible (max {LINKEDIN_SCROLL_CYCLES} cycles)...")
        last_count = 0
        empty_cycles = 0
        for i in range(LINKEDIN_SCROLL_CYCLES):
            if self.out_of_time(150):
                print(f"      ⏱️ Stopping people scroll early ({self.budget_status()}).")
                break

            await self.smooth_scroll(page, direction="down", distance=1600)
            await self.human_delay(0.5, 1.1)

            try:
                show_more_btn = page.locator("button:has-text('Show more')").first
                if await show_more_btn.count() > 0 and await show_more_btn.is_visible():
                    print(f"      🖱️ Cycle {i+1}: Clicking 'Show more'...")
                    await self.human_click(show_more_btn)
                    await self.human_delay(0.8, 1.4)
            except Exception:
                pass

            loaded_count = await self.count_loaded_employee_profiles(page)
            print(f"      📌 Visible profile links: {loaded_count}")

            if loaded_count >= MIN_EMPLOYEE_POOL:
                print("      ✅ Enough employee cards loaded for 15 VIP selection.")
                break

            if loaded_count <= last_count:
                empty_cycles += 1
            else:
                empty_cycles = 0
            last_count = loaded_count

            if empty_cycles >= MAX_EMPTY_SCROLL_CYCLES and loaded_count >= TARGET_PEOPLE_COUNT:
                print("      ⚠️ No new cards are loading; continuing with the visible pool.")
                break

            await self.simulate_human(page)

        print("   🧲 Harvesting loaded profiles...")
        js_extract = """
        () => {
            let results = [];
            let cards = document.querySelectorAll('.org-people-profile-card__profile-info, li.reusable-search__result-container, .artdeco-entity-lockup');
            cards.forEach(card => {
                let linkEl = card.querySelector('a[href*="/in/"]');
                if(linkEl) {
                    let text = card.innerText.replace(/\\n/g, ' | ');
                    let url = linkEl.href.split('?')[0];
                    if (url.includes("/in/")) {
                        results.push({ text: text, url: url });
                    }
                }
            });
            return results;
        }
        """
        raw_employees = await page.evaluate(js_extract)
        unique_employees = {emp['url']: emp['text'] for emp in raw_employees}
        print(f"   ✅ Found {len(unique_employees)} visible employees.")

        if not unique_employees:
            print("   ⚠️ No employees found. The page might not have loaded correctly.")
            return

        selection_prompt = f"""
        You have a list of raw text scraped from {COMPANY_NAME}'s LinkedIn 'People' tab.
        Select the TOP {TARGET_PEOPLE_COUNT} most senior / VIP roles (C-Suite, Founders, Directors, VP, Head of X, etc).

        RAW DATA:
        {json.dumps(unique_employees, indent=2)}

        OUTPUT JSON:
        {{
          "vip_candidates": [
            {{ "name": "Exact Name", "role": "Exact Role", "profile_url": "https://www.linkedin.com/in/..." }}
          ]
        }}
        """
        print("   🧠 Asking AI to select VIPs...")
        res = await self.generate_robust(selection_prompt, default={"vip_candidates": []})
        ai_candidates = res.get("vip_candidates", []) or []

        # Keep AI candidates first, then fill to 15 with a deterministic seniority heuristic.
        merged = []
        seen_urls = set()
        for c in ai_candidates:
            url = c.get("profile_url")
            if url and url not in seen_urls:
                merged.append({
                    "name": c.get("name", "Unknown"),
                    "role": c.get("role", "Unknown"),
                    "profile_url": url,
                })
                seen_urls.add(url)

        if len(merged) < TARGET_PEOPLE_COUNT:
            fallback = self.fallback_vip_candidates(unique_employees, merged)
            for c in fallback:
                if len(merged) >= TARGET_PEOPLE_COUNT:
                    break
                if c["profile_url"] not in seen_urls:
                    merged.append(c)
                    seen_urls.add(c["profile_url"])
            print(f"   🧩 Filled VIP list with heuristic fallback: {len(merged)}/{TARGET_PEOPLE_COUNT}.")

        self.vip_candidates = merged[:TARGET_PEOPLE_COUNT]
        print(f"   🎯 Selected {len(self.vip_candidates)} VIPs.")

    async def capture_linkedin_profiles(self, page):
        print("\n--- Phase 2: Capturing LinkedIn Profiles (Fast) ---")

        for idx, vip in enumerate(self.vip_candidates):
            if self.out_of_time(90):
                print(f"   ⏱️ Stopping profile capture early ({self.budget_status()}).")
                break

            name = vip.get('name', 'Unknown')
            role = vip.get('role', 'Unknown')
            url = vip.get('profile_url')

            if not url:
                continue

            print(f"\n   [{idx+1}/{len(self.vip_candidates)}] 📸 Visiting: {name} ({role})")

            try:
                await self.fast_goto(page, url)
                await self.human_delay(1.5, 3.0)
                await self.simulate_human(page)

                safe_name = re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')
                person_dir = f"{self.profiles_dir}/{safe_name}"
                os.makedirs(person_dir, exist_ok=True)

                for i in range(1, PROFILE_SCREENSHOTS_PER_PERSON + 1):
                    await page.screenshot(path=f"{person_dir}/profile_{i:02d}.jpg", type="jpeg", quality=75)
                    if i < PROFILE_SCREENSHOTS_PER_PERSON:
                        await self.smooth_scroll(page, direction="down", distance=650)
                        await self.human_delay(0.8, 1.5)

                self.roster.append({
                    "name": name,
                    "type": "Person",
                    "role": role,
                    "socials": {"linkedin": url, "twitter": None, "instagram": None},
                    "profile_screenshots": person_dir
                })

                await self.human_delay(0.8, 1.6)
            except Exception as e:
                print(f"      ❌ Error capturing {name}: {str(e)[:80]}")

    # ------------------------------------------------------------------
    # PART 2: X & INSTAGRAM VIA LIVE BROWSER
    # ------------------------------------------------------------------
    async def find_twitter_handles(self, page):
        print("\n--- Phase 3: X/Twitter Hunt (Lite) ---")
        if not ENABLE_X_HUNT:
            print("   ⏭️ Skipped by config.")
            return
        if not self.roster:
            return

        import urllib.parse

        for person in self.roster[:MAX_X_SEARCHES]:
            if self.out_of_time(45):
                print(f"   ⏱️ Stopping X hunt early ({self.budget_status()}).")
                break

            name = person['name'].split(',')[0].split('-')[0].strip()
            query_string = f"{name} {COMPANY_NAME}"
            encoded_query = urllib.parse.quote(query_string)
            search_url = f"https://x.com/search?q={encoded_query}&src=typed_query&f=user"

            print(f"   🔎 Searching X: '{query_string}'...")

            try:
                await self.fast_goto(page, search_url)
                await self.human_delay(2, 4)
                await self.simulate_human(page)
                await self.human_check(page)

                page_text = await page.locator("body").inner_text(timeout=5000)
                if "No results for" in page_text:
                    print(f"      ⚠️ No results found for '{query_string}'")
                    continue

                cards = await page.locator("div[data-testid='UserCell']").all()
                card_data = []
                if cards:
                    for c in cards[:3]:
                        try:
                            card_data.append(await c.inner_text())
                        except Exception:
                            pass
                else:
                    try:
                        timeline_text = await page.locator("div[data-testid='primaryColumn']").inner_text(timeout=3000)
                        card_data = [timeline_text[:1500]]
                    except Exception:
                        card_data = [page_text[:1500]]

                screenshot = await page.screenshot(type="jpeg", quality=55)

                prompt = f"""
                Analyze these X/Twitter user search results for: "{name}"
                Role/Context: {person['role']} at {COMPANY_NAME}
                Input Data: {json.dumps(card_data)}

                RULES:
                1. Find the best match if there is a confident match.
                2. If none of these users look correct, return null.
                3. match_url must start with https://x.com/
                OUTPUT JSON: {{ "match_url": "https://x.com/handle" }} OR {{ "match_url": null }}
                """

                linkedin_photo_bytes = None
                if person.get('profile_screenshots'):
                    li_path = f"{person['profile_screenshots']}/profile_01.jpg"
                    if os.path.exists(li_path):
                        with open(li_path, "rb") as f:
                            linkedin_photo_bytes = f.read()

                images_to_send = []
                if linkedin_photo_bytes:
                    images_to_send.append(linkedin_photo_bytes)
                images_to_send.append(screenshot)

                res = await self.generate_robust(prompt, images_to_send, default={"match_url": None})

                if res.get("match_url"):
                    print(f"      ✅ Found Candidate: {res['match_url']}")
                    person['socials']['twitter'] = res['match_url']

                    safe_name = re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')
                    path = f"{self.twitter_dir}/{safe_name}_x_profile.jpg"
                    try:
                        await self.fast_goto(page, res['match_url'])
                        await self.human_delay(1.2, 2.2)
                        await page.screenshot(path=path, type="jpeg", quality=70)
                    except Exception:
                        pass
                else:
                    print("      ⚠️ No confident match")
            except Exception as e:
                print(f"      ❌ Error processing {name}: {str(e)[:80]}")

            await self.human_delay(0.8, 1.6)

    async def find_instagram_handles(self, page):
        print("\n--- Phase 4: Instagram Hunt ---")
        if not ENABLE_INSTAGRAM_HUNT or MAX_IG_SEARCHES <= 0:
            print("   ⏭️ Skipped in five-minute mode. Use the brand Instagram from MANUAL_URLS, or enable this for deeper runs.")
            return

        # Kept intentionally small for the five-minute profile.
        for idx, person in enumerate(self.roster[:MAX_IG_SEARCHES]):
            if self.out_of_time(45):
                print(f"   ⏱️ Stopping Instagram hunt early ({self.budget_status()}).")
                break

            name = person['name'].split(',')[0].split('-')[0].strip()
            print(f"\n   [{idx+1}/{min(len(self.roster), MAX_IG_SEARCHES)}] {name}")

            try:
                await self.fast_goto(page, "https://www.instagram.com/explore/")
                await self.human_delay(2, 4)
                await self.simulate_human(page)

                search_input = page.locator("input[aria-label='Search input'], input[placeholder='Search']").first
                if not await search_input.is_visible():
                    try:
                        search_icon = page.locator("svg[aria-label='Search']").locator("..")
                        await self.human_click(search_icon)
                        await self.human_delay(0.8, 1.6)
                    except Exception:
                        pass

                try:
                    await search_input.wait_for(state="visible", timeout=4000)
                    await self.human_click(search_input)
                    await search_input.press("Control+A")
                    await search_input.press("Backspace")
                    await self.human_type(search_input, name)
                    await self.human_delay(1.5, 2.5)
                except Exception as e:
                    print(f"      ⚠️ Search input failed: {str(e)[:50]}")
                    continue

                candidates = []
                try:
                    result_links = await page.locator("a[href^='/'][role='link']").all()
                    for link in result_links[:4]:
                        href = await link.get_attribute("href")
                        if href and href.count('/') >= 2 and "explore" not in href:
                            username = href.strip('/').split('/')[0]
                            text_content = await link.inner_text()
                            candidates.append({
                                "username": username,
                                "raw_text": text_content.replace("\n", " | ")
                            })
                except Exception:
                    pass

                if not candidates:
                    print("      ⚠️ No candidates found")
                    continue

                screenshot = await page.screenshot(type="jpeg", quality=55)
                prompt = f"""
                Analyze Instagram search results for: "{name}"
                Context: {person['role']} at {COMPANY_NAME}
                Candidates: {json.dumps(candidates)}

                Return the single best username if there is a strong match.
                JSON: {{ "username": "user1" }} OR {{ "username": null }}
                """
                decision = await self.generate_robust(prompt, screenshot, default={"username": None})
                username = decision.get("username")
                if username:
                    profile_url = f"https://www.instagram.com/{username}/"
                    person['socials']['instagram'] = profile_url
                    print(f"      ✅ Candidate: {profile_url}")
                else:
                    print("      ⚠️ AI found no likely candidate")
            except Exception as e:
                print(f"      ❌ Error: {str(e)[:80]}")

            await self.human_delay(0.8, 1.6)

    # ------------------------------------------------------------------
    # MAIN UNIFIED CDP RUNNER
    # ------------------------------------------------------------------
    async def run(self):
        if not COMPANY_NAME or not any(self.found_brand_handles.values()):
            raise ValueError("A company name and at least one social profile are required")
        print(f"🚀 Starting Five-Minute Researcher for {COMPANY_NAME}...")
        print(f"   ⏱️ Budget: {MAX_RUNTIME_SECONDS}s | Required VIPs: {TARGET_PEOPLE_COUNT} | Employee pool target: {MIN_EMPLOYEE_POOL} | X lite: {ENABLE_X_HUNT} | IG people: {ENABLE_INSTAGRAM_HUNT}")

        async with async_playwright() as p:
            try:
                if self.found_brand_handles.get("linkedin"):
                    print("   🔗 Connecting to the dedicated signed-in Chrome session...")
                    browser = await p.chromium.connect_over_cdp(LINKEDIN_CDP_URL, timeout=10000)
                    context = browser.contexts[0]
                    page = await context.new_page()
                    await self.extract_direct_employees(page)
                    if not self.out_of_time(90):
                        await self.capture_linkedin_profiles(page)
                    else:
                        print(f"   ⏭️ Skipping profile capture ({self.budget_status()}).")

                    if self.roster and ENABLE_X_HUNT and not self.out_of_time(45):
                        await self.find_twitter_handles(page)
                    else:
                        print(f"   ⏭️ Skipping X hunt ({self.budget_status()}).")

                    if ENABLE_INSTAGRAM_HUNT and not self.out_of_time(45):
                        await self.find_instagram_handles(page)
                    else:
                        print(f"   ⏭️ Skipping Instagram people hunt ({self.budget_status()}).")

                    await page.close()
                    await browser.close()
                else:
                    print("   LinkedIn profile not configured; saving the verified brand handles only.")

            except Exception as e:
                print(f"\n⚠️ Signed-in LinkedIn browser unavailable: {str(e)[:160]}. Keeping the brand roster.")

        # --- SAVE FINAL DATA ---
        final_roster = [{
            "name": COMPANY_NAME,
            "type": "Brand",
            "role": "Official",
            "socials": self.found_brand_handles,
            "profile_screenshots": None,
            "metrics": {
                "employees": self.total_employee_count
            }
        }]
        final_roster.extend(self.roster)

        os.makedirs(os.path.dirname(ROSTER_FILE) or ".", exist_ok=True)
        with open(ROSTER_FILE, "w") as f:
            json.dump(final_roster, f, indent=2)

        print(f"\n✅ Researcher Complete in {int(self.elapsed_seconds())}s. Roster saved with {len(self.roster)} people and {self.total_employee_count} total employees.")


if __name__ == "__main__":
    asyncio.run(SocialResearcher().run())
