import asyncio
import json
import os
import uuid
import time
import re
import random
from datetime import datetime
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from google import genai
from google.genai import types

# --- CONFIGURATION ---
API_KEYS = [value.strip() for value in os.environ.get("NORTHSTAR_MARKETING_GEMINI_KEYS", "").split(",") if value.strip()]

COMPANY_NAME = os.environ.get("NORTHSTAR_MARKETING_COMPANY", "").strip()
ROSTER_FILE = os.environ.get("NORTHSTAR_MARKETING_ROSTER_FILE", f"data/{COMPANY_NAME}_omni_roster.json")
MODEL_ROSTER = ["gemini-3.1-flash-lite"] # Fast-first fallback order
USER_DATA_DIR = os.environ.get("NORTHSTAR_MARKETING_BROWSER_DIR", "./browser_profile")
LINKEDIN_CDP_URL = os.environ.get("NORTHSTAR_MARKETING_CDP_URL", "http://127.0.0.1:9222")
SHARED_SIGNED_IN_CHROME = os.environ.get("NORTHSTAR_MARKETING_BROWSER_MODE") == "shared_cdp"
HEADLESS = os.environ.get("NORTHSTAR_MARKETING_HEADLESS", "0") == "1"

# Five-minute run budget.
# The monitor will collect as much as it safely can, then skip optional work when the budget is low.
MAX_RUNTIME_SECONDS = int(os.environ.get("NORTHSTAR_MARKETING_MONITOR_SECONDS", "300"))
MIN_SECONDS_TO_START_ENTITY = 22
MIN_SECONDS_TO_START_STEALTH_PHASE = 45
MIN_SECONDS_FOR_WEB_MEDIA = 35
MAX_ENTITIES_PER_RUN = None # Set to a number to hard-cap roster size per run

# Tuning
# Fast profile: keeps the same collection flow, but shortens waits and reduces per-entity depth.
# Increase these numbers when you want a deeper, slower capture.
MAX_POSTS = 2
MAX_WEB_HITS = 1
MAX_COMMENTS = 2
TEST_LIMIT = None # Set to a number, e.g. 5, to test a partial roster

# Speed knobs. 1.0 is the old speed. 0.35 is materially faster while still allowing pages to render.
DELAY_SCALE = 0.20
CLICK_DELAY_SCALE = 0.25
SCROLL_DELAY_SCALE = 0.30

# Keep all existing monitor categories enabled. Flip these only when you want a narrower/faster run.
FETCH_LINKEDIN_COMMENTS = True
FETCH_X_REPLIES = True
FETCH_INSTAGRAM_COMMENTS = True
FETCH_WEB_MEDIA = os.environ.get("NORTHSTAR_MARKETING_WEB_MEDIA", "0") == "1"
WEB_MEDIA_SCOPE = "brand_only" # Options: "brand_and_people", "brand_only"

# Viewport Settings (Only applied to automated browser)
DESKTOP_VIEWPORT = {'width': 1440, 'height': 900}
MOBILE_VIEWPORT = {'width': 390, 'height': 844}

class SocialMonitor:
    def __init__(self):
        self.api_keys = API_KEYS
        self.current_key_index = 0
        self.client = genai.Client(api_key=self.api_keys[0]) if self.api_keys else None

        date_str = datetime.now().strftime("%Y%m%d")
        self.data_dir = os.environ.get("NORTHSTAR_MARKETING_OUTPUT_DIR", f"data/social_intel_{COMPANY_NAME}_{date_str}")
        os.makedirs(f"{self.data_dir}/screenshots", exist_ok=True)
        os.makedirs(f"{self.data_dir}/media", exist_ok=True)

        self.master_db = []
        self.started_at = time.monotonic()

    # ------------------------------------------------------------------
    # RUNTIME BUDGET HELPERS
    # ------------------------------------------------------------------
    def elapsed_seconds(self):
        return time.monotonic() - self.started_at

    def remaining_seconds(self):
        return max(0, MAX_RUNTIME_SECONDS - self.elapsed_seconds())

    def has_time(self, min_remaining=0):
        return self.remaining_seconds() > min_remaining

    def should_start_work(self, label, min_remaining=MIN_SECONDS_TO_START_ENTITY):
        if self.has_time(min_remaining):
            return True
        print(f"      ⏱️ Skipping {label}: only {int(self.remaining_seconds())}s left in five-minute budget.")
        return False

    # ------------------------------------------------------------------
    # AI & UTILITY HELPERS
    # ------------------------------------------------------------------
    def rotate_key(self):
        if not self.api_keys:
            return
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        self.client = genai.Client(api_key=self.api_keys[self.current_key_index])
        print(f"      🔄 Rotated to API Key #{self.current_key_index + 1}")

    def clean_json(self, text):
        text = text.strip()
        text = re.sub(r'^```json\s*|```$', '', text, flags=re.MULTILINE)
        return text.strip()

    async def generate_robust(self, prompt, image_bytes=None):
        """Bounded Gemini helper so transient model errors do not consume the whole run."""
        if self.client is None:
            return {"topic_tags": [], "category": "Unclassified", "sentiment": "Unknown", "summary": "AI tagging unavailable", "is_relevant": True}
        contents = [prompt]
        if image_bytes:
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))

        # Leave some room for browser cleanup and JSON saving.
        local_deadline = time.monotonic() + min(24, max(5, self.remaining_seconds() - 8))
        attempts = 0

        while time.monotonic() < local_deadline and self.has_time(8):
            for model_name in MODEL_ROSTER:
                if time.monotonic() >= local_deadline or not self.has_time(8):
                    break
                attempts += 1
                try:
                    response = self.client.models.generate_content(
                        model=model_name, contents=contents,
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    if response.text:
                        return json.loads(self.clean_json(response.text))
                except Exception as e:
                    error_msg = str(e).lower()
                    if "429" in error_msg or "quota" in error_msg:
                        self.rotate_key()
                        time.sleep(0.5)
                    else:
                        print(f"      ⚠️ Model Error: {str(e)[:80]}...")
                        time.sleep(0.4)

        print("      ⏱️ AI tagging fallback used to preserve five-minute budget.")
        return {
            "topic_tags": [],
            "category": "Unknown",
            "sentiment": "Neutral",
            "summary": "AI tagging skipped or timed out during five-minute monitor run.",
            "is_relevant": True
        }

    def extract_post_date(self, text):
        patterns = [r'(\d+[mhdwoy])(?=\s|•|$)', r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}']
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match: return match.group(0)
        return "Unknown"

    def save_db(self):
        with open(f"{self.data_dir}/master_feed.json", "w") as f:
            json.dump(self.master_db, f, indent=2)

    # ------------------------------------------------------------------
    # ULTRA-STEALTH HUMANIZATION HELPERS
    # ------------------------------------------------------------------
    async def human_delay(self, min_sec=3.0, max_sec=8.0):
        await asyncio.sleep(max(0.15, random.uniform(min_sec, max_sec) * DELAY_SCALE))

    async def smooth_scroll(self, page, direction="down", distance=800):
        chunks = random.randint(6, 12)
        chunk_size = distance / chunks
        for _ in range(chunks):
            scroll_val = chunk_size + random.uniform(-20, 20)
            if direction == "up":
                scroll_val = -scroll_val
            await page.evaluate(f"window.scrollBy(0, {scroll_val})")
            await asyncio.sleep(max(0.05, random.uniform(0.1, 0.4) * SCROLL_DELAY_SCALE))

    async def human_click(self, locator):
        await locator.scroll_into_view_if_needed()
        await locator.hover()
        await asyncio.sleep(max(0.1, random.uniform(0.3, 1.2) * CLICK_DELAY_SCALE))
        await locator.click()

    async def simulate_human(self, page):
        viewport = page.viewport_size
        if not viewport: return
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, viewport['width'] - 100)
            y = random.randint(100, viewport['height'] - 100)
            await page.mouse.move(x, y, steps=random.randint(10, 25))
            await asyncio.sleep(max(0.05, random.uniform(0.2, 0.8) * DELAY_SCALE))

    async def human_check(self, page):
        try:
            if "login" in page.url or "auth" in page.url:
                print(f"\n🛑 BLOCK DETECTED on {page.url}")
                deadline = time.monotonic() + 8
                while "login" in page.url and time.monotonic() < deadline:
                    await asyncio.sleep(1)
                print("✅ Resuming...")
                await page.wait_for_timeout(2000)
        except: pass

    async def nuke_overlays(self, page):
        """Remove popups, cookie banners, and overlays for clean screenshots"""
        try:
            await page.evaluate("""
                () => {
                    const selectors = [
                        '[class*="cookie"]', '[id*="cookie"]',
                        '[class*="popup"]', '[id*="popup"]',
                        '[class*="modal"]', '[id*="modal"]',
                        '[class*="overlay"]', '[id*="overlay"]',
                        '[class*="banner"]', '[id*="banner"]',
                        '.consent', '#consent'
                    ];
                    selectors.forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.remove());
                    });
                    document.querySelectorAll('*').forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.position === 'fixed' || style.position === 'sticky') {
                            el.style.display = 'none';
                        }
                    });
                }
            """)
        except: pass


    def clean_display_text(self, text):
        """Clean text intended for frontend display while preserving paragraph breaks."""
        if not text:
            return ""

        text = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = [line.strip() for line in text.split("\n")]

        junk_patterns = [
            r"^see more$",
            r"^show more$",
            r"^like$",
            r"^comment$",
            r"^repost$",
            r"^send$",
            r"^share$",
            r"^follow$",
            r"^connect$",
            r"^message$",
            r"^more$",
            r"^visible to (anyone|connections)$",
            r"^\d+[smhdw]$",
            r"^\d+\s*(likes?|comments?|reposts?|replies?)$",
            r"^[•·\-]+$",
        ]

        cleaned = []
        for line in lines:
            if not line:
                cleaned.append("")
                continue

            if any(re.match(pattern, line, re.IGNORECASE) for pattern in junk_patterns):
                continue

            cleaned.append(line)

        # Collapse excessive blank lines, but keep normal paragraph breaks.
        out = []
        previous_blank = False
        for line in cleaned:
            if line == "":
                if not previous_blank:
                    out.append("")
                previous_blank = True
            else:
                out.append(line)
                previous_blank = False

        return "\n".join(out).strip()

    async def extract_linkedin_post_text(self, post):
        """Extract only the LinkedIn post body, not the author/header/actions."""
        selectors = [
            "div.update-components-text",
            "div.feed-shared-update-v2__description-wrapper",
            "div.feed-shared-inline-show-more-text",
            "div.feed-shared-text",
            "span.break-words",
        ]

        candidates = []
        for selector in selectors:
            try:
                nodes = await post.locator(selector).all()
                for node in nodes:
                    text = self.clean_display_text(await node.inner_text())
                    if len(text) > 20:
                        candidates.append(text)
            except:
                pass

        if candidates:
            return max(candidates, key=len)

        # Fallback: remove obvious chrome/UI elements from a cloned post card.
        try:
            text = await post.evaluate("""
            (el) => {
                const clone = el.cloneNode(true);
                const removeSelectors = [
                    "button",
                    "svg",
                    "img",
                    "[class*='actor']",
                    "[class*='header']",
                    "[class*='social']",
                    "[class*='comment']",
                    "[class*='reaction']",
                    "[class*='control']",
                    "[aria-label*='reaction']",
                    "[aria-label*='comment']",
                    "[aria-label*='repost']",
                    "[aria-label*='send']"
                ];
                removeSelectors.forEach(sel => {
                    clone.querySelectorAll(sel).forEach(node => node.remove());
                });
                return clone.innerText || "";
            }
            """)
            return self.clean_display_text(text)
        except:
            return ""

    async def extract_x_post_text(self, tweet):
        """Extract only the actual tweet body."""
        try:
            text = await tweet.locator("div[data-testid='tweetText']").first.inner_text()
            return self.clean_display_text(text)
        except:
            return ""

    async def tag_content(self, screenshot, raw_text, platform, entity_name):
        prompt = f"""
        Analyze this {platform} content for {entity_name}.
        TEXT: "{raw_text[:1000]}..."
        OUTPUT JSON:
        {{
            "topic_tags": ["tag1", "tag2"],
            "category": "Announcement/Hiring/Opinion/Personal/Interview",
            "sentiment": "Positive/Neutral/Negative",
            "summary": "One sentence summary.",
            "is_relevant": true
        }}
        """
        return await self.generate_robust(prompt, screenshot)

    # ------------------------------------------------------------------
    # PART 1: LINKEDIN (CDP / REAL BROWSER)
    # ------------------------------------------------------------------
    async def monitor_linkedin(self, page, url, name):
        if not self.should_start_work(f"LinkedIn for {name}"):
            return []
        print(f"   👉 Scraping LinkedIn: {name}... ({int(self.remaining_seconds())}s left)")

        target_url = f"{url.rstrip('/')}/posts/?feedView=all" if "company" in url else f"{url.rstrip('/')}/recent-activity/all/"

        try:
            await page.goto(target_url, wait_until="domcontentloaded")
            await self.human_delay(3, 5)
            await self.simulate_human(page)
            await self.human_check(page)

            # Initial Load Scroll
            for _ in range(2):
                await page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
                await self.human_delay(1.0, 1.8)

            data = []

            # STATE PRESERVING LOOP
            for i in range(MAX_POSTS):
                if not self.has_time(18):
                    print("      ⏱️ LinkedIn post loop stopped to preserve five-minute budget.")
                    break
                try:
                    posts = await page.locator("div.feed-shared-update-v2, li.profile-creator-shared-feed-update__container").all()

                    if i >= len(posts):
                        print("      ⚠️ No more posts available.")
                        break

                    post = posts[i]
                    await post.scroll_into_view_if_needed()
                    await self.human_delay(0.5, 1.5)

                    # 1. Expand Text naturally
                    try:
                        btn = post.locator("button.feed-shared-inline-show-more-text__see-more-less-toggle").first
                        if await btn.is_visible():
                            await self.human_click(btn)
                            await self.human_delay(2, 4) # Pause to read expanded text
                    except: pass

                    # 2. Capture Main
                    raw_txt = await post.inner_text()
                    post_text = await self.extract_linkedin_post_text(post)
                    shot = await post.screenshot(type="jpeg", quality=70)
                    file_id = f"LI_{uuid.uuid4().hex[:6]}"
                    path = f"{self.data_dir}/screenshots/{file_id}.jpg"
                    with open(path, "wb") as f: f.write(shot)

                    # 3. Comments (In-Place)
                    comments_data = []
                    try:
                        if not FETCH_LINKEDIN_COMMENTS or not self.has_time(28):
                            raise RuntimeError("LinkedIn comment capture disabled or skipped by budget")
                        comment_btn = post.locator("button[aria-label*='comment'], span.feed-shared-social-counts__num-comments").first
                        if await comment_btn.is_visible():
                            await self.human_click(comment_btn)
                            await self.human_delay(3, 6) # Read first comments

                            # Load More Comments
                            for _ in range(2):
                                load_more = post.locator("button.comments-comments-list__load-more-comments-button").first
                                if await load_more.is_visible():
                                    await self.human_click(load_more)
                                    await self.human_delay(2, 4)
                                else: break

                            comms = await post.locator("article.comments-comment-item").all()
                            for c in comms[:MAX_COMMENTS]:
                                try:
                                    author = await c.locator("span.comments-post-meta__name-text").first.inner_text()
                                    body = await c.locator("span.comments-comment-item__main-content").first.inner_text()
                                    comments_data.append({"author": author.strip(), "text": body.strip()})
                                except: pass
                    except: pass

                    display_text = post_text or raw_txt
                    tags = await self.tag_content(shot, display_text, "LinkedIn", name)
                    tags['post_date'] = self.extract_post_date(raw_txt)

                    data.append({
                        "id": file_id, "platform": "LinkedIn", "entity": name,
                        "url": page.url, "timestamp": datetime.now().isoformat(),
                        "meta": tags, "screenshot": path,
                        "post_text": display_text,
                        "raw_text": raw_txt,
                        "comments": comments_data
                    })
                    print(f"      💾 Post {i+1}: {tags.get('summary')} ({len(comments_data)} comments)")

                    await self.human_delay(2, 4) # Pause before moving to next post

                except Exception as e:
                    print(f"      ⚠️ Skipped Post {i+1}: {str(e)[:50]}")
                    continue
            return data
        except Exception as e:
            print(f"      ❌ LinkedIn Error: {e}")
            return []

    # ------------------------------------------------------------------
    # PART 2: TWITTER, INSTAGRAM, WEB (STEALTH BROWSER)
    # ------------------------------------------------------------------
    async def monitor_twitter(self, page, url, name):
        if not self.should_start_work(f"X for {name}"):
            return []
        print(f"   👉 Scraping X: {name}... ({int(self.remaining_seconds())}s left)")
        try:
            await page.goto(url, wait_until="domcontentloaded")
            await self.human_delay(3, 5)
            await self.simulate_human(page)
            await self.human_check(page)

            data = []
            processed_urls = set()

            print(f"      📜 Loading tweets...")
            for scroll_round in range(3):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await self.human_delay(1.0, 1.8)
                await self.simulate_human(page)

            tweets = await page.locator("article[data-testid='tweet']").all()
            print(f"      📊 Found {len(tweets)} tweets loaded")

            for i in range(min(MAX_POSTS, len(tweets))):
                if not self.has_time(18):
                    print("      ⏱️ X tweet loop stopped to preserve five-minute budget.")
                    break
                try:
                    tweet = tweets[i]
                    await tweet.scroll_into_view_if_needed()
                    await self.human_delay(0.5, 1.5)

                    tweet_link = None
                    try:
                        link_elem = await tweet.locator("a[href*='/status/']").first.get_attribute("href")
                        if link_elem:
                            tweet_link = f"https://twitter.com{link_elem}" if not link_elem.startswith("http") else link_elem
                    except: pass

                    if tweet_link in processed_urls: continue
                    if tweet_link: processed_urls.add(tweet_link)

                    raw_txt = await tweet.inner_text()
                    post_text = await self.extract_x_post_text(tweet)
                    display_text = post_text or self.clean_display_text(raw_txt) or raw_txt
                    shot = await tweet.screenshot(type="jpeg", quality=70)

                    file_id = f"X_{uuid.uuid4().hex[:6]}"
                    path = f"{self.data_dir}/screenshots/{file_id}.jpg"
                    with open(path, "wb") as f: f.write(shot)

                    comments_data = []
                    comments_shot_path = None
                    if tweet_link and FETCH_X_REPLIES and self.has_time(32):
                        try:
                            new_page = await page.context.new_page()
                            await new_page.goto(tweet_link, timeout=15000)
                            await self.human_delay(3, 5)

                            for _ in range(2):
                                await new_page.evaluate("window.scrollBy(0, 800)")
                                await self.human_delay(1, 2)

                            comments_shot_path = f"{self.data_dir}/screenshots/{file_id}_comments.jpg"
                            await new_page.screenshot(path=comments_shot_path, full_page=False)

                            replies = await new_page.locator("article[data-testid='tweet']").all()
                            for r in replies[1:MAX_COMMENTS+1]:
                                try:
                                    r_text = await r.locator("div[data-testid='tweetText']").first.inner_text()
                                    comments_data.append(r_text)
                                except: pass

                            await new_page.close()
                        except Exception as e:
                            print(f"         ⚠️ Comment fetch failed: {str(e)[:40]}")

                    tags = await self.tag_content(shot, display_text, "Twitter", name)
                    tags['post_date'] = self.extract_post_date(raw_txt)

                    data.append({
                        "id": file_id, "platform": "X", "entity": name,
                        "url": tweet_link or page.url, "timestamp": datetime.now().isoformat(),
                        "meta": tags, "screenshot": path,
                        "post_text": display_text,
                        "raw_text": raw_txt,
                        "comments": comments_data,
                        "comments_screenshot": comments_shot_path if comments_data else None
                    })
                    print(f"      💾 Tweet {i+1}/{MAX_POSTS}: {tags.get('summary')[:60]}... ({len(comments_data)} replies)")

                except Exception as e:
                    print(f"      ⚠️ Tweet {i+1} error: {str(e)[:50]}")
                    continue

            return data
        except Exception as e:
            print(f"      ❌ Twitter Error: {e}")
            return []

    async def monitor_instagram(self, context, url, name):
        if not self.should_start_work(f"Instagram for {name}"):
            return []
        print(f"   👉 Scraping Instagram: {name}... ({int(self.remaining_seconds())}s left)")
        page = await context.new_page()
        await page.set_viewport_size(MOBILE_VIEWPORT)

        try:
            await page.goto(url, timeout=15000)
            await self.human_delay(3, 6)

            if "login" in page.url:
                print("      ⚠️ Login required, skipping Instagram")
                return []

            grid_shot = await page.screenshot(type="jpeg", quality=60)
            grid_id = f"IG_GRID_{uuid.uuid4().hex[:6]}"
            with open(f"{self.data_dir}/screenshots/{grid_id}.jpg", "wb") as f: f.write(grid_shot)

            data = [{
                "id": grid_id, "platform": "Instagram", "entity": name,
                "type": "Grid", "screenshot": f"{self.data_dir}/screenshots/{grid_id}.jpg"
            }]

            all_links = await page.locator("a[href*='/p/'], a[href*='/reel/']").all()

            unique_hrefs = []
            seen = set()
            for l in all_links:
                try:
                    h = await l.get_attribute("href")
                    if h and h not in seen:
                        seen.add(h)
                        unique_hrefs.append(h)
                except: pass

            print(f"      📊 Found {len(unique_hrefs)} posts")

            for i, href in enumerate(unique_hrefs[:min(2, MAX_POSTS)]):
                if not self.has_time(18):
                    print("      ⏱️ Instagram post loop stopped to preserve five-minute budget.")
                    break
                try:
                    post_url = f"https://www.instagram.com{href}" if not href.startswith("http") else href
                    print(f"      👉 Post {i+1}/{min(2, MAX_POSTS)}: {post_url}")

                    await page.goto(post_url, timeout=15000)
                    await self.human_delay(3, 5)
                    await self.simulate_human(page)

                    try: txt = await page.locator("h1, span._aacl, div._a9zs").first.inner_text()
                    except: txt = ""

                    shot = await page.screenshot(type="jpeg", quality=70)
                    file_id = f"IG_{uuid.uuid4().hex[:6]}"
                    path = f"{self.data_dir}/screenshots/{file_id}.jpg"
                    with open(path, "wb") as f: f.write(shot)

                    comments_data = []
                    try:
                        if not FETCH_INSTAGRAM_COMMENTS or not self.has_time(28):
                            raise RuntimeError("Instagram comment capture disabled or skipped by budget")
                        await page.evaluate("window.scrollBy(0, 500)")
                        await self.human_delay(1, 2)
                        comms = await page.locator("ul li span._aacl, div._a9zs").all()
                        for c in comms[:MAX_COMMENTS]:
                            try:
                                c_text = await c.inner_text()
                                if c_text and c_text not in comments_data:
                                    comments_data.append(c_text)
                            except: pass
                    except: pass

                    post_text = self.clean_display_text(txt)
                    tags = await self.tag_content(shot, post_text or txt, "Instagram", name)
                    data.append({
                        "id": file_id, "platform": "Instagram", "entity": name,
                        "url": post_url, "meta": tags, "screenshot": path,
                        "post_text": post_text or txt,
                        "raw_text": txt,
                        "comments": comments_data, "timestamp": datetime.now().isoformat()
                    })
                    print(f"      💾 IG Post {i+1}: {tags.get('summary', 'N/A')[:50]}... ({len(comments_data)} comments)")

                except Exception as e:
                    print(f"      ⚠️ Post {i+1} error: {str(e)[:50]}")
                    continue

            return data
        except Exception as e:
            print(f"      ❌ Instagram Error: {e}")
            return []
        finally:
            await page.close()

    async def monitor_web_media(self, page, name, role):
        if not self.should_start_work(f"Web/Media for {name}", MIN_SECONDS_FOR_WEB_MEDIA):
            return []
        print(f"   🌍 Scouting Web/Podcasts for: {name}... ({int(self.remaining_seconds())}s left)")
        if page.is_closed(): return []

        query = f'{name} {COMPANY_NAME} (podcast OR interview OR reddit OR youtube)'
        data = []

        try:
            import urllib.parse
            encoded_query = urllib.parse.quote(query)
            search_url = f"https://www.google.com/search?q={encoded_query}"

            await page.goto(search_url, timeout=15000)
            await self.human_delay(2, 4)
            await self.simulate_human(page)

            result_links = await page.locator("a[jsname='UWckNb'], div#search a[href^='http'], div.g a[href^='http']").all()

            links = []
            seen_urls = set()

            for res in result_links:
                try:
                    url = await res.get_attribute("href")
                    if not url or not url.startswith("http"): continue
                    skip_domains = ["google.com", "youtube.com/redirect", "webcache", "translate.google"]
                    if any(x in url for x in skip_domains) or url in seen_urls: continue

                    seen_urls.add(url)
                    links.append(url)
                    if len(links) >= MAX_WEB_HITS: break
                except: continue

            if len(links) == 0:
                print(f"      ⚠️ Google returned no results, trying DuckDuckGo...")
                ddg_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
                await page.goto(ddg_url, timeout=15000)
                await self.human_delay(2, 4)

                ddg_results = await page.locator("a.result__a, a.result__url").all()
                for res in ddg_results:
                    try:
                        url = await res.get_attribute("href")
                        if not url: continue
                        if "//duckduckgo.com/l/" in url:
                            parsed = urllib.parse.urlparse(url)
                            params = urllib.parse.parse_qs(parsed.query)
                            if 'uddg' in params: url = urllib.parse.unquote(params['uddg'][0])
                        if url.startswith("//"): url = f"https:{url}"
                        skip_domains = ["google.com", "duckduckgo.com"]
                        if not url.startswith("http") or any(x in url for x in skip_domains): continue

                        if url not in seen_urls:
                            seen_urls.add(url)
                            links.append(url)
                        if len(links) >= MAX_WEB_HITS: break
                    except: continue

            print(f"      🔎 Found {len(links)} media hits")

            for idx, link in enumerate(links[:MAX_WEB_HITS]):
                if not self.has_time(22):
                    print("      ⏱️ Web/media loop stopped to preserve five-minute budget.")
                    break
                print(f"      👉 [{idx+1}/{len(links)}] Visiting: {link[:70]}...")
                try:
                    await page.goto(link, timeout=20000, wait_until="domcontentloaded")
                    await self.human_delay(3, 5)
                    await self.simulate_human(page)
                    await self.nuke_overlays(page)

                    for scroll in range(2):
                        await page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
                        await self.human_delay(0.8, 1.5)

                    screenshot = await page.screenshot(type="jpeg", quality=60, full_page=False)
                    file_id = f"MEDIA_{name.replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
                    path = f"{self.data_dir}/screenshots/{file_id}.jpg"
                    with open(path, "wb") as f: f.write(screenshot)

                    body_text = ""
                    try:
                        if "reddit.com" in link:
                            main_content = await page.locator("div[data-test-id='post-content'], div.Post, div[class*='Comment']").all()
                            if main_content:
                                for elem in main_content[:10]:
                                    try: body_text += await elem.inner_text() + "\n\n"
                                    except: pass
                        if not body_text:
                            body_text = await page.locator("article, main, body").first.inner_text()
                    except: body_text = ""

                    try: page_title = await page.title()
                    except: page_title = "Unknown"

                    tags = await self.tag_content(screenshot, body_text[:2000], "Web/Media", name)

                    if tags.get("is_relevant", True):
                        data.append({
                            "id": file_id, "platform": "Web/Media", "entity": name,
                            "url": link, "page_title": page_title, "meta": tags,
                            "screenshot": path,
                            "post_text": self.clean_display_text(body_text[:3000]),
                            "raw_text": body_text[:3000],
                            "timestamp": datetime.now().isoformat()
                        })
                        print(f"         ✅ Captured: {tags.get('summary', 'N/A')[:60]}...")
                    else:
                        print(f"         ⚠️ Skipped (not relevant)")

                except Exception as e:
                    print(f"         ❌ Error: {str(e)[:60]}")
                    continue

            return data
        except Exception as e:
            print(f"      ❌ Web/Media Error: {str(e)[:100]}")
            return []

    # ------------------------------------------------------------------
    # MAIN HYBRID RUNNER
    # ------------------------------------------------------------------
    async def run(self):
        if not os.path.exists(ROSTER_FILE):
            print(f"❌ No Roster found at {ROSTER_FILE}.")
            return

        with open(ROSTER_FILE, "r") as f:
            roster = json.load(f)

        print(f"🚀 Starting Five-Minute Hybrid Omni-Monitor for {COMPANY_NAME}...")
        target_roster = roster[:TEST_LIMIT] if TEST_LIMIT else roster
        if MAX_ENTITIES_PER_RUN:
            target_roster = target_roster[:MAX_ENTITIES_PER_RUN]
        print(f"⏱️ Runtime budget: {MAX_RUNTIME_SECONDS}s for {len(target_roster)} roster entries.")

        # --- PHASE 1: the persistent signed-in Chrome context used by research ---
        async with async_playwright() as p:
            try:
                print("\n🔗 [PHASE 1] Connecting to signed-in LinkedIn Chrome...")
                browser = await p.chromium.connect_over_cdp(LINKEDIN_CDP_URL, timeout=60000)
                context = browser.contexts[0]
                page_cdp = await context.new_page()

                for entity in target_roster:
                    if not self.should_start_work("next LinkedIn entity"):
                        break
                    socials = entity.get('socials', {})
                    if socials.get('linkedin'):
                        print(f"\n🕵️ [LINKEDIN] MONITORING: {entity['name']}")
                        li_data = await self.monitor_linkedin(page_cdp, socials['linkedin'], entity['name'])
                        self.master_db.extend(li_data)
                        self.save_db() # Save immediately

                await page_cdp.close()
                await browser.close()

            except Exception as e:
                print(f"\n⚠️ LinkedIn phase unavailable; continuing with other platforms.")
                print(f"Error: {e}")

        # --- HYBRID PART 2: AUTOMATED BROWSER (X, IG, WEB) ---
        if not self.has_time(MIN_SECONDS_TO_START_STEALTH_PHASE):
            print(f"\n⏱️ Skipping Phase 2: only {int(self.remaining_seconds())}s left in five-minute budget.")
            self.save_db()
            print(f"\n✅ Monitor Complete. {len(self.master_db)} total items captured.")
            print(f"📂 Data saved to: {self.data_dir}/master_feed.json")
            return

        print("\n🤖 [PHASE 2] Capturing X, Instagram and Web...")
        try:
          async with Stealth().use_async(async_playwright()) as p:
            browser_managed = None
            context_managed = None
            page_managed = None
            try:
                if SHARED_SIGNED_IN_CHROME:
                    browser_managed = await p.chromium.connect_over_cdp(LINKEDIN_CDP_URL, timeout=60000)
                    context_managed = browser_managed.contexts[0]
                    page_managed = await context_managed.new_page()
                    print("   🔗 Using the same signed-in Chrome context for all social platforms.")
                else:
                    context_managed = await p.chromium.launch_persistent_context(
                        user_data_dir=USER_DATA_DIR,
                        headless=HEADLESS,
                        args=["--disable-blink-features=AutomationControlled"],
                        viewport=DESKTOP_VIEWPORT,
                        ignore_default_args=["--enable-automation"]
                    )
                    page_managed = context_managed.pages[0] if context_managed.pages else await context_managed.new_page()

                for entity in target_roster:
                    if not self.should_start_work("next social entity"):
                        break
                    print(f"\n🕵️ [SOCIAL] MONITORING: {entity['name']}")
                    socials = entity.get('socials', {})

                    if socials.get('twitter'):
                        x_data = await self.monitor_twitter(page_managed, socials['twitter'], entity['name'])
                        self.master_db.extend(x_data)
                        self.save_db()

                    if socials.get('instagram'):
                        ig_data = await self.monitor_instagram(context_managed, socials['instagram'], entity['name'])
                        self.master_db.extend(ig_data)
                        self.save_db()

                    should_fetch_web = (
                        FETCH_WEB_MEDIA
                        and self.has_time(MIN_SECONDS_FOR_WEB_MEDIA)
                        and (WEB_MEDIA_SCOPE == "brand_and_people" or entity['name'] == COMPANY_NAME)
                    )
                    if should_fetch_web:
                        web_data = await self.monitor_web_media(page_managed, entity['name'], entity.get('role', ''))
                        self.master_db.extend(web_data)
                        self.save_db()
            finally:
                if SHARED_SIGNED_IN_CHROME:
                    if page_managed:
                        await page_managed.close()
                    if browser_managed:
                        await browser_managed.close()
                elif context_managed:
                    await context_managed.close()
        except Exception as e:
            print(f"\n⚠️ X/Instagram phase unavailable: {str(e)[:160]}")

        self.save_db()
        print(f"\n✅ Monitor Complete. {len(self.master_db)} total items captured.")
        print(f"📂 Data saved to: {self.data_dir}/master_feed.json")

if __name__ == "__main__":
    asyncio.run(SocialMonitor().run())
