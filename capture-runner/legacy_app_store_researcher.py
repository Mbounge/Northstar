import asyncio
import json
import os
import uuid
import time
import re
import random
import urllib.parse
import io
from datetime import datetime
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
# Note: Since you are connecting to a live, human-driven Chrome instance, 
# the Playwright Stealth wrapper is typically omitted for the CDP connection phase.
from processing.openai_processing_client import ProcessingClient

# --- CONFIGURATION ---
COMPANY_NAME = "Awin"
APP_SEARCH_QUERY = "Awin"

# Port where your active Chrome instance is listening for remote debugging
CHROME_CDP_URL = "http://127.0.0.1:9222" 

class AppStoreResearcher:
    def __init__(self):
        self.client = ProcessingClient()

        date_str = datetime.now().strftime("%Y%m%d")
        self.data_dir = f"data/app_store_intel_{COMPANY_NAME}_{date_str}"
        self.screenshots_dir = f"{self.data_dir}/screenshots"
        self.icons_dir = f"{self.data_dir}/icons"
        os.makedirs(self.screenshots_dir, exist_ok=True)
        os.makedirs(self.icons_dir, exist_ok=True)

        self.manifest = {
            "app_name": COMPANY_NAME,
            "search_query": APP_SEARCH_QUERY,
            "timestamp": datetime.now().isoformat(),
            "app_store_url": None,
            "raw_data": {
                "hero": {},
                "description": "",
                "app_info": {},
                "in_app_purchases": "",
                "version_history": {},
                "raw_reviews": [],
                "developer": {},
                "competitors": []
            },
            "screenshots": {},
            "intelligence": {}
        }

    # ------------------------------------------------------------------
    # AI & UTILITY HELPERS
    # ------------------------------------------------------------------
    def clean_json(self, text):
        text = text.strip()
        text = re.sub(r'^```json\s*|```$', '', text, flags=re.MULTILINE)
        return text.strip()

    async def generate_robust(self, prompt, image_bytes=None):
        result, _usage = await self.client.json(
            prompt, images=(image_bytes,) if image_bytes else (), image_mime="image/jpeg",
            model="gpt-6-luna",
        )
        return result

    async def human_delay(self, min_sec=1.5, max_sec=3.5):
        await asyncio.sleep(random.uniform(min_sec, max_sec))

    async def safe_text(self, locator, timeout=5000, fallback=""):
        try:
            return await locator.inner_text(timeout=timeout)
        except Exception:
            return fallback

    async def safe_attr(self, locator, attr, timeout=5000, fallback=None):
        try:
            return await locator.get_attribute(attr, timeout=timeout)
        except Exception:
            return fallback

    async def safe_visible(self, locator, timeout=3000):
        try:
            return await locator.is_visible(timeout=timeout)
        except Exception:
            return False

    async def safe_click(self, locator, timeout=3000):
        try:
            await locator.click(timeout=timeout)
            return True
        except Exception:
            return False

    def _extract_description_from_body(self, body: str) -> str:
        if not body:
            return ""
        end_markers = ["Ratings & Reviews", "What's New", "App Privacy"]
        end_idx = len(body)
        for marker in end_markers:
            idx = body.find(marker)
            if idx != -1 and idx < end_idx:
                end_idx = idx
        chunk = body[:end_idx]
        nav_noise = {
            "search", "today", "games", "apps", "arcade", "categories",
            "photo & video", "health & fitness", "productivity", "entertainment",
            "action", "adventure", "puzzle", "indie", "free", "in-app",
            "only for iphone", "view in mac", "ratings", "ages", "category",
            "sports", "developer", "language", "size", "english",
        }
        lines = chunk.splitlines()
        desc_lines = []
        capturing = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if capturing:
                    desc_lines.append("")
                continue
            low = stripped.lower()
            if not capturing:
                if len(stripped) > 60 and not any(n in low for n in nav_noise):
                    capturing = True
                    desc_lines.append(stripped)
            else:
                desc_lines.append(stripped)
        result = "\n".join(desc_lines).strip()
        result = re.sub(r'\nmore\s*$', '', result, flags=re.IGNORECASE).strip()
        return result

    def _extract_reviews_from_body(self, body: str) -> list:
        if not body:
            return []
        start_marker = "Ratings & Reviews"
        end_markers = ["What's New", "App Privacy", "Information\nSeller"]
        start = body.find(start_marker)
        if start == -1:
            return []
        start += len(start_marker)
        end = len(body)
        for marker in end_markers:
            idx = body.find(marker, start)
            if idx != -1 and idx < end:
                end = idx
        section = body[start:end].strip()
        date_pattern = re.compile(
            r'\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}|\d+[dw] ago|\d+ days? ago'
        )
        reviews = []
        lines = section.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if date_pattern.fullmatch(line) or date_pattern.search(line):
                title = lines[i - 1].strip() if i > 0 else ""
                username = lines[i + 1].strip() if i + 1 < len(lines) else ""
                body_lines = []
                j = i + 2
                while j < len(lines):
                    next_line = lines[j].strip()
                    if date_pattern.search(next_line):
                        break
                    if next_line.lower() == "more":
                        j += 1
                        continue
                    body_lines.append(next_line)
                    j += 1
                review_body = "\n".join(b for b in body_lines if b).strip()
                if review_body:
                    reviews.append({
                        "title": title,
                        "date": line,
                        "username": username,
                        "body": review_body
                    })
                i = j
            else:
                i += 1
        return reviews

    # ------------------------------------------------------------------
    # IMAGE UTILITIES & EXTRACTION LOGIC
    # ------------------------------------------------------------------
    def _perceptual_hash(self, image_bytes: bytes, size: int = 16) -> str:
        img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((size, size))
        pixels = list(img.getdata())
        mean = sum(pixels) / len(pixels)
        bits = "".join("1" if p >= mean else "0" for p in pixels)
        return hex(int(bits, 2))[2:].zfill(size * size // 4)

    def _hash_distance(self, h1: str, h2: str) -> int:
        b1 = bin(int(h1, 16))[2:].zfill(len(h1) * 4)
        b2 = bin(int(h2, 16))[2:].zfill(len(h2) * 4)
        return sum(c1 != c2 for c1, c2 in zip(b1, b2))

    def _open_image_safe(self, data: bytes) -> Image.Image | None:
        if not data or len(data) < 100:
            return None
        if data[:6] in (b'GIF87a', b'GIF89a'):
            return None
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
            return img
        except Exception:
            return None

    def _mask_to_squircle(self, img: Image.Image) -> Image.Image:
        img = img.convert("RGBA")
        w, h = img.size
        r = int(min(w, h) * 0.225)
        
        scale = 4
        mask = Image.new("L", (w * scale, h * scale), 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle((0, 0, w * scale, h * scale), radius=r * scale, fill=255)
        
        mask = mask.resize((w, h), Image.LANCZOS)
        
        result = img.copy()
        result.putalpha(mask)
        return result

    def _save_normalised_icon(self, image_bytes: bytes, path: str, size: int = 512) -> bool:
        img = self._open_image_safe(image_bytes)
        if img is None:
            return False
        try:
            img = img.convert("RGBA")
            if max(img.size) < 10:
                return False

            img = img.resize((size, size), Image.LANCZOS)
            crop_px = int(size * 0.02)
            img = img.crop((crop_px, crop_px, size - crop_px, size - crop_px))
            img = img.resize((size, size), Image.LANCZOS)
            img = self._mask_to_squircle(img)

            img.save(path, format="PNG", optimize=True)
            return True
        except Exception as e:
            print(f"      ⚠️  Icon save error: {e}")
            return False

    async def _fetch_image(self, page, url: str) -> bytes | None:
        try:
            resp = await page.request.get(url, timeout=10000)
            if not resp.ok:
                return None
            ct = (resp.headers.get("content-type") or "").lower()
            if not any(t in ct for t in ("image/", "octet-stream")):
                return None
            data = await resp.body()
            return data if data and len(data) > 100 else None
        except Exception:
            return None

    async def _download_and_save_icon(self, page, raw_url: str, save_path: str) -> bool:
        if not raw_url or any(raw_url.lower().endswith(ext) for ext in ('.gif', '.svg', '1x1')):
            return False
            
        base_url = raw_url.split('?')[0]
        upgraded_png = re.sub(r'/\d+x\d+[a-zA-Z]*\.([a-zA-Z0-9]+)$', '/512x512.png', base_url, flags=re.IGNORECASE)
        upgraded_jpg = re.sub(r'/\d+x\d+[a-zA-Z]*\.([a-zA-Z0-9]+)$', '/512x512.jpg', base_url, flags=re.IGNORECASE)
        
        for attempt_url in [upgraded_png, upgraded_jpg, raw_url]:
            data = await self._fetch_image(page, attempt_url)
            if data and self._save_normalised_icon(data, save_path):
                return True
        return False

    async def _extract_high_res_icon_url(self, page) -> str | None:
        return await page.evaluate("""
            () => {
                for (const source of document.querySelectorAll('picture source')) {
                    const srcset = source.srcset || '';
                    if (!srcset.includes('mzstatic') && !srcset.includes('ssl')) continue;
                    const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
                    if (parts.length > 0) {
                        const last = parts[parts.length - 1].split(/\s+/)[0];
                        if (last && !last.endsWith('.gif') && !last.endsWith('.svg')) return last;
                    }
                }

                let bestSrc = null;
                let maxRes = 0;
                for (const img of document.querySelectorAll('img')) {
                    const src = img.src || img.currentSrc || '';
                    if (!src || src.startsWith('data:')) continue;
                    
                    const isCDN = src.includes('mzstatic') || src.includes('is1-ssl')
                        || src.includes('is2-ssl') || src.includes('is3-ssl')
                        || src.includes('is4-ssl') || src.includes('is5-ssl');
                    if (!isCDN) continue;
                    if (src.endsWith('.gif') || src.endsWith('.svg')) continue;
                    
                    const rect = img.getBoundingClientRect();
                    if (rect.width < 40 || rect.height < 40) continue;
                    
                    const ar = rect.width / rect.height;
                    if (ar < 0.75 || ar > 1.35) continue; 
                    
                    const pageY = rect.top + window.scrollY;
                    if (pageY > 800) continue; 
                    
                    let candidate = src;
                    const srcset = img.srcset || img.getAttribute('srcset') || '';
                    if (srcset) {
                        const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
                        if (parts.length > 0) {
                            candidate = parts[parts.length - 1].split(/\s+/)[0];
                        }
                    }
                    
                    const res = (img.naturalWidth || 0) + (img.naturalHeight || 0);
                    if (res >= maxRes) {
                        maxRes = res;
                        bestSrc = candidate;
                    }
                }
                return bestSrc;
            }
        """)

    # ------------------------------------------------------------------
    # APP ICON CAPTURE
    # ------------------------------------------------------------------
    async def capture_app_icon(self, page) -> str | None:
        print("   🎨 Capturing App Icon at maximum resolution...")

        icon_url = await self._extract_high_res_icon_url(page)
        icon_path = f"{self.icons_dir}/app_icon_512x512.png"

        if icon_url:
            print(f"      🔗 Icon URL: {icon_url[:100]}...")
            if await self._download_and_save_icon(page, icon_url, icon_path):
                print(f"      ✅ Icon saved (512×512 PNG): {icon_path}")
                self.manifest["screenshots"]["app_icon"] = icon_path
                return icon_path

        print("      ⚠️  Download failed — screenshotting icon element directly...")
        try:
            icon_handle = await page.evaluate_handle("""
                () => {
                    let best = null;
                    let maxArea = 0;
                    for (const img of document.querySelectorAll('img')) {
                        const rect = img.getBoundingClientRect();
                        if (rect.width < 50 || rect.height < 50) continue;
                        const ar = rect.width / rect.height;
                        if (ar < 0.7 || ar > 1.4) continue;
                        if (rect.top + window.scrollY > 800) continue;
                        const area = rect.width * rect.height;
                        if (area > maxArea) {
                            maxArea = area;
                            best = img;
                        }
                    }
                    return best;
                }
            """)
            elem = icon_handle.as_element()
            if elem:
                await elem.evaluate("""
                    (el) => {
                        let current = el;
                        for(let i=0; i<4; i++) {
                            if(!current) break;
                            current.style.setProperty('border-radius', '0px', 'important');
                            current.style.setProperty('border', 'none', 'important');
                            current.style.setProperty('box-shadow', 'none', 'important');
                            current.style.setProperty('outline', 'none', 'important');
                            current = current.parentElement;
                        }
                    }
                """)
                await asyncio.sleep(0.1)
                raw_bytes = await elem.screenshot(type="png", omit_background=True)
                if raw_bytes and self._save_normalised_icon(raw_bytes, icon_path):
                    print(f"      ✅ Icon saved via element screenshot: {icon_path}")
                    self.manifest["screenshots"]["app_icon"] = icon_path
                    return icon_path
        except Exception as e:
            print(f"      ❌ Element screenshot failed: {e}")
        return None

    # ------------------------------------------------------------------
    # CAROUSEL SCREENSHOTS (HIGH-RES CDN DOWNLOADER)
    # ------------------------------------------------------------------
    async def capture_carousel_screenshots(self, page) -> list:
        print("   🎠 Capturing Carousel Screenshots...")

        carousel_index = await page.evaluate("""
            () => {
                const lists = [...document.querySelectorAll('ul')];
                for (let listIdx = 0; listIdx < lists.length; listIdx++) {
                    const ul = lists[listIdx];
                    const items = [...ul.querySelectorAll(':scope > li')];
                    if (items.length < 2) continue;

                    let screenshotLiCount = 0;
                    for (const li of items) {
                        const img = li.querySelector('img');
                        if (!img) continue;
                        const bb = img.getBoundingClientRect();
                        const w  = bb.width;
                        const h  = bb.height;
                        if (w < 50 || h < 50) continue;
                        const ar = w / h;
                        if (ar < 0.75 || ar > 1.4) {
                            screenshotLiCount++;
                        }
                    }
                    if (screenshotLiCount >= 2) {
                        return listIdx;
                    }
                }
                return -1;
            }
        """)

        if carousel_index == -1:
            print("      ⚠️  Could not locate screenshot carousel.")
            return []

        carousel_handle = await page.evaluate_handle(
            "(idx) => document.querySelectorAll('ul')[idx]",
            carousel_index
        )
        carousel_elem = carousel_handle.as_element()
        if not carousel_elem:
            print("      ⚠️  Could not get element handle for carousel.")
            return []

        await carousel_elem.scroll_into_view_if_needed()
        await page.evaluate("window.scrollBy(0, -80)")
        await asyncio.sleep(1.0)

        li_count = await page.evaluate(
            "(idx) => document.querySelectorAll('ul')[idx].querySelectorAll(':scope > li').length",
            carousel_index
        )
        print(f"      Found {li_count} <li> items in the screenshot carousel.")

        saved_paths = []
        seen_urls = set()

        for i in range(li_count):
            try:
                await page.evaluate(f"""
                    ([idx, i]) => {{
                        const li = document.querySelectorAll('ul')[idx]
                                           .querySelectorAll(':scope > li')[i];
                        if (li) li.scrollIntoView({{ behavior: 'instant', inline: 'center' }});
                    }}
                """, [carousel_index, i])
                await asyncio.sleep(0.5)

                is_screenshot_slide = await page.evaluate("""
                    ([idx, i]) => {
                        const li = document.querySelectorAll('ul')[idx]
                                           .querySelectorAll(':scope > li')[i];
                        const img = li?.querySelector('img');
                        if (!img) return false;
                        const bb = img.getBoundingClientRect();
                        const ar = bb.width / bb.height;
                        return ar < 0.75 || ar > 1.4;
                    }
                """, [carousel_index, i])

                if not is_screenshot_slide:
                    continue

                slide_bytes = None

                high_res_url = await page.evaluate("""
                    ([idx, i]) => {
                        const li = document.querySelectorAll('ul')[idx].querySelectorAll(':scope > li')[i];
                        if (!li) return null;
                        
                        let bestUrl = null;
                        
                        const sources = Array.from(li.querySelectorAll('source'));
                        for (const source of sources) {
                            const srcset = source.getAttribute('srcset') || '';
                            if (srcset) {
                                const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
                                if (parts.length > 0) {
                                    const highest = parts[parts.length - 1].split(/\\s+/)[0];
                                    if (highest) {
                                        bestUrl = highest;
                                        if (!bestUrl.includes('.webp')) return bestUrl; 
                                    }
                                }
                            }
                        }
                        
                        if (bestUrl) return bestUrl;
                        
                        const img = li.querySelector('img');
                        if (img) {
                            const srcset = img.getAttribute('srcset') || '';
                            if (srcset) {
                                const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
                                if (parts.length > 0) {
                                    return parts[parts.length - 1].split(/\\s+/)[0];
                                }
                            }
                            return img.getAttribute('src');
                        }
                        return null;
                    }
                """, [carousel_index, i])

                if high_res_url:
                    if high_res_url in seen_urls:
                        print(f"      🔁 Slide {i+1} URL is a duplicate — skipping.")
                        continue
                    seen_urls.add(high_res_url)
                    
                    high_res_url = re.sub(r'/\d+x\d+[a-zA-Z]*\.([a-zA-Z0-9]+)$', r'/1200x0w.\1', high_res_url, flags=re.IGNORECASE)
                    
                    slide_bytes = await self._fetch_image(page, high_res_url)
                    if slide_bytes:
                        print(f"      🔗 Slide {i+1}: High-Res CDN image downloaded.")

                if not slide_bytes:
                    print(f"      ⚠️  Slide {i+1}: CDN download failed. Falling back to clean viewport capture...")
                    img_handle = await page.evaluate_handle(
                        """([idx, i]) => {
                            const li = document.querySelectorAll('ul')[idx]
                                               .querySelectorAll(':scope > li')[i];
                            return li?.querySelector('picture img') || li?.querySelector('img') || li;
                        }""",
                        [carousel_index, i]
                    )
                    img_elem = img_handle.as_element()
                    
                    if img_elem:
                        await img_elem.evaluate("""
                            (el) => {
                                el.style.setProperty('border-radius', '0px', 'important');
                                el.style.setProperty('border', 'none', 'important');
                                el.style.setProperty('box-shadow', 'none', 'important');
                                el.style.setProperty('margin', '0px', 'important');
                                el.style.setProperty('padding', '0px', 'important');
                                el.style.setProperty('background', 'transparent', 'important');
                            }
                        """)
                        await asyncio.sleep(0.1)
                        slide_bytes = await img_elem.screenshot(type="jpeg", quality=100)

            except Exception as e:
                print(f"      ⚠️  Could not process slide {i+1}: {e}")
                continue

            if not slide_bytes:
                continue

            try:
                img = Image.open(io.BytesIO(slide_bytes))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                
                idx = len(saved_paths) + 1
                fpath = f"{self.screenshots_dir}/carousel_{idx:02d}.jpg"
                
                img.save(fpath, "JPEG", quality=100)
                saved_paths.append(fpath)
                print(f"      📸 Carousel slide {idx} saved: {fpath}")

            except Exception as e:
                print(f"      ⚠️  Error processing bytes for slide {i+1}: {e}")
                continue

        print(f"      ✅ Carousel complete: {len(saved_paths)} unique high-res slides.")
        self.manifest["screenshots"]["carousel"] = saved_paths
        return saved_paths

    # ------------------------------------------------------------------
    # "YOU MIGHT ALSO LIKE" COMPETITOR SCRAPE
    # ------------------------------------------------------------------
    async def scrape_competitors(self, page) -> list:
        print("\n   🕵️  [PHASE 2b] Scraping 'You Might Also Like' Competitors...")

        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(2.0)

        card_data = await page.evaluate("""
            () => {
                let section = null;
                for (const el of document.querySelectorAll('h2, h3, [class*="headline"]')) {
                    if (/you might also like/i.test(el.innerText || '')) {
                        section = el.closest('section') || el.parentElement;
                        break;
                    }
                }
                if (!section) return null;

                const results = [];
                const seenUrls = new Set();
                const items = section.querySelectorAll('li');

                items.forEach((li, liIdx) => {
                    const link = li.querySelector('a[href*="apps.apple.com"]');
                    const url  = link?.href || null;
                    if (!url || seenUrls.has(url)) return;
                    seenUrls.add(url);

                    const nameEl = li.querySelector('.we-lockup__title, [class*="title"], h3, h4');
                    const subEl = li.querySelector('.we-lockup__subtitle, [class*="subtitle"], [class*="genre"]');

                    results.push({
                        name:     nameEl?.innerText?.trim() || '',
                        subtitle: subEl?.innerText?.trim()  || '',
                        url,
                    });
                });

                return results;
            }
        """)

        if not card_data:
            print("      ⚠️  Could not find 'You Might Also Like' section.")
            return []

        print(f"      Found {len(card_data)} competitor apps.")
        original_url = page.url
        competitors = []

        for card in card_data:
            name     = card.get("name", "Unknown")
            subtitle = card.get("subtitle", "")
            url      = card.get("url", "")
            i        = len(competitors)

            safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', name)[:40].strip('_') or f"app_{i+1}"
            icon_path = f"{self.icons_dir}/competitor_{i+1:02d}_{safe_name}.png"

            if not url:
                competitors.append({"name": name, "subtitle": subtitle, "url": url, "icon_path": None})
                continue

            try:
                print(f"      🔗 [{i+1}] Navigating to {name}...")
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await asyncio.sleep(2.5)

                icon_url = await self._extract_high_res_icon_url(page)
                saved = False
                if icon_url:
                    if await self._download_and_save_icon(page, icon_url, icon_path):
                        saved = True
                        print(f"      ✅ [{i+1}] {name} — high-res CDN silhouette saved.")

                if not saved:
                    icon_handle = await page.evaluate_handle("""
                        () => {
                            let best = null;
                            let maxArea = 0;
                            for (const img of document.querySelectorAll('img')) {
                                const rect = img.getBoundingClientRect();
                                if (rect.width < 50 || rect.height < 50) continue;
                                const ar = rect.width / rect.height;
                                if (ar < 0.7 || ar > 1.4) continue;
                                if (rect.top + window.scrollY > 800) continue;
                                const area = rect.width * rect.height;
                                if (area > maxArea) {
                                    maxArea = area;
                                    best = img;
                                }
                            }
                            return best;
                        }
                    """)
                    icon_elem = icon_handle.as_element()
                    if icon_elem:
                        await icon_elem.evaluate("""
                            (el) => {
                                let current = el;
                                for(let i=0; i<4; i++) {
                                    if(!current) break;
                                    current.style.setProperty('border-radius', '0px', 'important');
                                    current.style.setProperty('border', 'none', 'important');
                                    current.style.setProperty('box-shadow', 'none', 'important');
                                    current.style.setProperty('outline', 'none', 'important');
                                    current = current.parentElement;
                                }
                            }
                        """)
                        await asyncio.sleep(0.1)
                        raw = await icon_elem.screenshot(type="png", omit_background=True)
                        if raw and self._save_normalised_icon(raw, icon_path):
                            saved = True
                            print(f"      ✅ [{i+1}] {name} — icon saved via CSS-stripped element screenshot.")

                if not saved:
                    print(f"      ❌ [{i+1}] {name} — no renderable icon found.")
                    icon_path = None

            except Exception as e:
                icon_path = None

            competitors.append({
                "name":      name,
                "subtitle":  subtitle,
                "url":       url,
                "icon_path": icon_path,
            })

        print(f"\n      🔙 Returning to original app page...")
        await page.goto(original_url, wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2.0)

        self.manifest["raw_data"]["competitors"] = competitors
        saved_count = sum(1 for c in competitors if c["icon_path"])
        print(f"      ✅ Competitors scraped: {len(competitors)} apps, {saved_count} icons saved.")
        return competitors

    # ------------------------------------------------------------------
    # PHASE 1: SEARCH & CONFIRM
    # ------------------------------------------------------------------
    async def search_and_confirm_app(self, page):
        print(f"\n🔍 [PHASE 1] Searching for '{APP_SEARCH_QUERY}' on Apple App Store...")
        encoded_query = urllib.parse.quote(f"{APP_SEARCH_QUERY} site:apps.apple.com")
        search_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        await page.goto(search_url, timeout=20000)
        await self.human_delay()

        results = await page.locator("a.result__url").all()
        candidate_links = []
        for res in results[:5]:
            href = await self.safe_attr(res, "href")
            if href:
                if "//duckduckgo.com/l/" in href:
                    parsed = urllib.parse.urlparse(href)
                    params = urllib.parse.parse_qs(parsed.query)
                    if 'uddg' in params:
                        href = urllib.parse.unquote(params['uddg'][0])
                if "apps.apple.com" in href and "/app/" in href:
                    candidate_links.append(href)

        if not candidate_links:
            print("   ❌ Could not find any App Store links in search results.")
            return False

        print(f"   🤖 Asking AI to confirm the correct link from {len(candidate_links)} candidates...")
        prompt = f"""
        We are looking for the official Apple App Store link for "{APP_SEARCH_QUERY}".
        Candidate URLs: {json.dumps(candidate_links, indent=2)}
        OUTPUT JSON: {{ "found": true/false, "correct_url": "https://...", "reason": "..." }}
        """
        decision = await self.generate_robust(prompt)
        if decision and decision.get("found") and decision.get("correct_url"):
            confirmed_url = decision["correct_url"]
            print(f"   ✅ AI Confirmed Link: {confirmed_url}")
            self.manifest["app_store_url"] = confirmed_url
            return True
        print("   ❌ AI could not confidently select a target URL.")
        return False

    # ------------------------------------------------------------------
    # PHASE 2: SCRAPING
    # ------------------------------------------------------------------
    async def scrape_app_store_page(self, page):
        url = self.manifest["app_store_url"]
        print(f"\n📱 [PHASE 2] Scraping App Store Page...")
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await self.human_delay(3, 5)

        raw_data = self.manifest["raw_data"]
        self._body_text_cache = ""

        # 1. HERO + ICON
        print("   🛠️  Extracting Hero Section...")
        raw_data["hero"]["title"]    = await self.safe_text(page.locator("h1").first)
        raw_data["hero"]["subtitle"] = await self.safe_text(
            page.locator("h1").locator("xpath=following-sibling::*[1]").first
        )
        await self.capture_app_icon(page)

        # 2. EXPAND DESCRIPTION
        print("   📖 Expanding & Extracting App Description...")
        await page.evaluate("window.scrollBy(0, 300)")
        await self.human_delay(1, 1.5)

        more_clicked = await page.evaluate("""
            () => {
                for (const el of document.querySelectorAll('a, button')) {
                    const t = (el.innerText || '').trim().toLowerCase();
                    if (t === 'more') {
                        el.scrollIntoView({ behavior: 'instant', block: 'center' });
                        el.click();
                        return true;
                    }
                }
                return false;
            }
        """)
        if not more_clicked:
            for strat in [
                page.get_by_role("link",   name=re.compile(r"^\s*more\s*$", re.IGNORECASE)),
                page.get_by_role("button", name=re.compile(r"^\s*more\s*$", re.IGNORECASE)),
                page.locator("a").filter(has_text=re.compile(r"^\s*more\s*$", re.IGNORECASE)),
                page.locator("button").filter(has_text=re.compile(r"^\s*more\s*$", re.IGNORECASE)),
                page.locator("button.truncated-text-btn"),
            ]:
                if await self.safe_visible(strat, timeout=1500):
                    await strat.scroll_into_view_if_needed()
                    if await self.safe_click(strat):
                        more_clicked = True
                        await self.human_delay(1, 1.5)
                        break

        full_body = await self.safe_text(page.locator("body"), timeout=6000)
        self._body_text_cache = full_body

        desc_text = ""
        for strat in [
            page.locator(".section__description"),
            page.locator("div[data-test-id='description']"),
            page.locator(".we-truncated-text"),
        ]:
            text = await self.safe_text(strat, timeout=3000)
            if text and len(text.strip()) > 50:
                desc_text = text.strip()
                break

        if not desc_text:
            desc_text = self._extract_description_from_body(full_body)
        raw_data["description"] = desc_text or full_body

        # 3. CAROUSEL SCREENSHOTS
        await page.evaluate("window.scrollTo(0, 0)")
        await self.human_delay(1)
        await self.capture_carousel_screenshots(page)

        # 4. WHAT'S NEW MODAL (Text only, no screenshots)
        print("   🔄 Extracting What's New / Version History...")
        whats_new_trigger = None
        for strat in [
            page.get_by_role("link",   name=re.compile(r"What.s New", re.IGNORECASE)),
            page.get_by_role("button", name=re.compile(r"What.s New", re.IGNORECASE)),
            page.locator("a").filter(has_text=re.compile(r"What.s New", re.IGNORECASE)),
        ]:
            if await self.safe_visible(strat, timeout=2000):
                whats_new_trigger = strat
                break

        if whats_new_trigger:
            await whats_new_trigger.scroll_into_view_if_needed()
            await page.evaluate("window.scrollBy(0, -100)")
            await self.human_delay(1)
            if await self.safe_click(whats_new_trigger):
                await self.human_delay(2, 3)
                modal = None
                for strat in [
                    page.locator("dialog[open]").first,
                    page.locator("div[role='dialog']").first,
                    page.locator(".we-modal").first,
                ]:
                    if await self.safe_visible(strat, timeout=3000):
                        modal = strat
                        break

                if modal:
                    scroll_attempts = 0
                    last_scroll_top = -1
                    while scroll_attempts < 20:
                        current_scroll_top = await modal.evaluate("""
                            (el) => {
                                const inner = el.querySelector('ul, ol, .we-modal__content') || el;
                                inner.scrollBy(0, 700);
                                return inner.scrollTop;
                            }
                        """)
                        await self.human_delay(0.5, 0.8)
                        if current_scroll_top == last_scroll_top:
                            break
                        last_scroll_top = current_scroll_top
                        scroll_attempts += 1

                    raw_data["version_history"]["full_text"] = await self.safe_text(modal, timeout=5000)

                    closed = False
                    for btn in [
                        modal.locator("button[aria-label='Close']"),
                        modal.locator("button").filter(has_text=re.compile(r"close", re.IGNORECASE)),
                    ]:
                        if await self.safe_visible(btn, timeout=1000):
                            if await self.safe_click(btn):
                                closed = True
                                break
                    if not closed:
                        await page.keyboard.press("Escape")
                    await self.human_delay(1)
                else:
                    wn = page.locator("section").filter(has_text=re.compile(r"What.s New", re.IGNORECASE)).first
                    raw_data["version_history"]["full_text"] = await self.safe_text(wn, timeout=3000)

        # 5. INFORMATION SECTION + IAP (Text only)
        print("   📋 Extracting Information Section...")
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await self.human_delay(1.5)

        EXPAND_CHEVRON_JS = """
            (labelText) => {
                const label = [...document.querySelectorAll('*')].find(
                    e => e.children.length === 0
                      && e.innerText?.trim().toLowerCase() === labelText.toLowerCase()
                );
                if (!label) return 'label-not-found';
                const row = label.closest('div, li, section') || label.parentElement;
                if (!row) return 'row-not-found';
                for (const root of [row, row.nextElementSibling, row.parentElement]) {
                    if (!root) continue;
                    const btn = root.querySelector('button, summary, [role="button"]');
                    if (btn) {
                        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                        btn.click();
                        return 'clicked';
                    }
                }
                return 'button-not-found';
            }
        """

        for label, msg in [("Compatibility", "Compatibility"), ("In-App Purchases", "IAP")]:
            result = await page.evaluate(EXPAND_CHEVRON_JS, label)
            if result == "clicked":
                await self.human_delay(1.5)

        info_data = await page.evaluate("""
            () => {
                const result = {};
                for (const dt of document.querySelectorAll('dt')) {
                    const key = dt.innerText.trim();
                    if (!key) continue;
                    const values = [];
                    let sib = dt.nextElementSibling;
                    while (sib && sib.tagName === 'DD') {
                        const v = sib.innerText.trim();
                        if (v) values.push(v);
                        sib = sib.nextElementSibling;
                    }
                    if (values.length === 1) result[key] = values[0];
                    else if (values.length > 1) result[key] = values;
                }
                if (Object.keys(result).length > 3) return { source: 'dt_dd', data: result };
                return null;
            }
        """)

        app_info = {}
        if info_data and "data" in info_data:
            app_info = info_data["data"]
        raw_data["app_info"] = app_info

        iap_list_js = await page.evaluate("""
            () => {
                const iapLabel = [...document.querySelectorAll('*')].find(
                    e => e.children.length === 0 && /^in-app purchases$/i.test(e.innerText?.trim())
                );
                if (iapLabel) {
                    let node = iapLabel.parentElement;
                    for (let i = 0; i < 6; i++) {
                        const list = node?.querySelector('ul, ol, [class*="iap"], [class*="purchase"]');
                        if (list && list.innerText.trim().length > 10) return list.innerText;
                        node = node?.parentElement;
                    }
                }
                return null;
            }
        """)
        raw_data["in_app_purchases"] = iap_list_js.strip() if iap_list_js else "Not found/Not expanded"

        # 6. REVIEWS (Text only)
        print("   ⭐ Extracting Raw Reviews...")
        review_texts = []
        review_cards = None
        for sel in ["div.we-customer-review", "div[class*='customer-review']", ".we-customer-reviews__item"]:
            cards = page.locator(sel)
            try:
                count = await cards.count()
                if count > 0:
                    review_cards = cards
                    break
            except:
                pass

        if review_cards:
            count = await review_cards.count()
            for i in range(count):
                text = await self.safe_text(review_cards.nth(i), timeout=3000)
                if text: review_texts.append(text.strip())
        else:
            review_texts = self._extract_reviews_from_body(self._body_text_cache)
        raw_data["raw_reviews"] = review_texts

        # 7. DEVELOPER ECOSYSTEM (Text only)
        print("   🏢 Extracting Developer Ecosystem...")
        dev_link = page.locator("a[href*='/developer/']").first
        if await self.safe_visible(dev_link, timeout=3000):
            dev_url = await self.safe_attr(dev_link, "href")
            if dev_url:
                raw_data["developer"]["url"] = dev_url
                try:
                    await page.goto(dev_url, wait_until="domcontentloaded", timeout=20000)
                    await self.human_delay(3, 5)
                    raw_data["developer"]["raw_text"] = await self.safe_text(page.locator("body"), timeout=5000)
                except Exception as e:
                    print(f"      ⚠️ Could not load developer page: {e}")
                
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                except Exception:
                    print("      ⚠️ Timeout returning to app page, continuing anyway...")
                await self.human_delay(2, 3)

        # 8. COMPETITORS
        await self.scrape_competitors(page)


    # ------------------------------------------------------------------
    # PHASE 3: AI INTELLIGENCE SYNTHESIS
    # ------------------------------------------------------------------
    async def synthesize_intelligence(self):
        print(f"\n🧠 [PHASE 3] Synthesizing Competitive Intelligence via AI...")
        raw_context = json.dumps(self.manifest["raw_data"], indent=2)
        
        prompt = f"""
        You are an expert Product Marketing Manager and Competitive Intelligence Analyst.
        RAW DATA from the Apple App Store listing for "{self.manifest['app_name']}":
        {raw_context}

        Generate a structured Competitive Intelligence brief covering:
        1. Positioning: core hook, target audience
        2. Monetization: pricing tiers, aggressiveness
        3. User Sentiment: strengths, complaints, feature requests
        4. Release Velocity: shipping cadence, latest features
        5. Developer Threat: app portfolio breadth
        6. Technical Profile: size, iOS requirements, platform support
        7. Competitor Landscape: who Apple surfaces alongside this app

        OUTPUT JSON FORMAT:
        {{
            "executive_summary": "...",
            "positioning_and_messaging": "...",
            "monetization_strategy": "...",
            "release_velocity": "...",
            "user_sentiment": {{
                "strengths": ["..."],
                "complaints_and_missing_features": ["..."]
            }},
            "technical_profile": {{
                "app_size": "...", "min_ios": "...", "platform_support": "...",
                "languages": "...", "age_rating": "..."
            }},
            "developer_ecosystem": "...",
            "competitor_landscape": ["..."]
        }}
        """
        intelligence = await self.generate_robust(prompt, image_bytes=None)
        if intelligence:
            self.manifest["intelligence"] = intelligence
            print("   ✅ Intelligence synthesized successfully.")
        else:
            print("   ❌ AI Synthesis failed.")

    # ------------------------------------------------------------------
    # MAIN RUNNER (MODIFIED FOR CDP CONNECTION)
    # ------------------------------------------------------------------
    async def run(self):
        print(f"🚀 Starting App Store Teardown Agent for '{APP_SEARCH_QUERY}'...")
        
        async with async_playwright() as p:
            try:
                print(f"\n🔗 Connecting to LIVE Chrome at {CHROME_CDP_URL}...")
                # Connect to your active debugging browser context
                browser = await p.chromium.connect_over_cdp(CHROME_CDP_URL)
                context = browser.contexts[0]
                
                if len(context.pages) > 0:
                    page = context.pages[0]
                    await page.bring_to_front()
                    print("   ✅ Attached to the existing active browser tab.")
                else:
                    page = await context.new_page()
                    print("   ✅ Created a new browser tab.")
                
                # Perform the verification phase
                found = await self.search_and_confirm_app(page)
                if not found:
                    print("   ⚠️ Target App Store link confirmation failed.")
                    await browser.close()
                    return

                # Run the automated retrieval operations
                await self.scrape_app_store_page(page)
                
                # Close the CDP connection context
                await browser.close()
                print("   🔌 Disconnected cleanly from Chrome instance.")
                
            except Exception as e:
                print(f"\n❌ CDP CONNECTION FAILED.")
                print(f"Please verify Chrome is running with remote debugging enabled on port 9222.")
                print(f"CommandLine Example:\n   chrome.exe --remote-debugging-port=9222 --user-data-dir=\"C:\\Path\\To\\Profile\"")
                print(f"Error: {e}")
                return

        await self.synthesize_intelligence()

        output_file = f"{self.data_dir}/app_store_manifest.json"
        with open(output_file, "w") as f:
            json.dump(self.manifest, f, indent=2)

        print(f"\n🎉 Process Complete. Data saved to:\n📂 {output_file}")
        print(f"📁 Files saved to: {self.data_dir}")

if __name__ == "__main__":
    asyncio.run(AppStoreResearcher().run())
