"""Shared OpenAI Responses client for offline MobileSpy enrichment.

Credentials are read only from the launching process environment. Failures raise
instead of writing an empty enrichment that would be mistaken for completed work.
"""

import asyncio
import base64
import json
import os
from types import SimpleNamespace

from openai import OpenAI


MODEL = os.getenv("MOBILESPY_PROCESSING_MODEL", "gpt-6-luna").strip()
REASONING = os.getenv("MOBILESPY_PROCESSING_REASONING", "high").strip()
MAX_OUTPUT_TOKENS = int(os.getenv("MOBILESPY_PROCESSING_MAX_OUTPUT_TOKENS", "16384"))


def environment_key():
    for name in ("MOBILESPY_OPENAI_API_KEYS", "OPENAI_API_KEYS", "OPENAI_API_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value.split(",", 1)[0].strip()
    return ""


class ProcessingClient:
    def __init__(self, api_key=None):
        key = api_key or environment_key()
        if not key:
            raise RuntimeError("Set OPENAI_API_KEY or MOBILESPY_OPENAI_API_KEYS in the launching terminal")
        self.client = OpenAI(api_key=key, timeout=240.0)

    async def json(self, prompt, images=(), image_mime="image/png", model=None):
        content = [{"type": "input_text", "text": prompt}]
        for data in images:
            encoded = base64.b64encode(data).decode("ascii")
            content.append({
                "type": "input_image",
                "image_url": f"data:{image_mime};base64,{encoded}",
                "detail": "high",
            })
        request = {
            "model": model or MODEL,
            "reasoning": {"effort": REASONING},
            "instructions": "Return one valid JSON object only. Ground visual claims in the supplied images.",
            "input": [{"role": "user", "content": content}],
            "text": {"format": {"type": "json_object"}},
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "store": False,
        }
        output_budget = MAX_OUTPUT_TOKENS
        usage_input = usage_output = usage_calls = 0
        for attempt in range(4):
            try:
                request["max_output_tokens"] = output_budget
                response = await asyncio.to_thread(self.client.responses.create, **request)
                usage = getattr(response, "usage", None)
                if usage is not None:
                    usage_input += getattr(usage, "input_tokens", 0) or 0
                    usage_output += getattr(usage, "output_tokens", 0) or 0
                    usage_calls += 1
                response_status = getattr(response, "status", None)
                if response_status == "incomplete":
                    details = getattr(response, "incomplete_details", None)
                    reason = getattr(details, "reason", None)
                    if reason == "max_output_tokens" and attempt < 3 and output_budget < 32768:
                        output_budget = min(output_budget * 2, 32768)
                        continue
                    raise RuntimeError(f"OpenAI response incomplete: {reason or 'unknown reason'}")
                if response_status != "completed":
                    raise RuntimeError(f"OpenAI response status: {response_status}")
                value = json.loads(response.output_text or "")
                if not isinstance(value, dict) or not value:
                    raise ValueError("OpenAI returned an empty or non-object JSON result")
                total_usage = (SimpleNamespace(input_tokens=usage_input,
                                               output_tokens=usage_output,
                                               request_count=usage_calls)
                               if usage_calls else None)
                return value, total_usage
            except Exception as exc:
                status = getattr(exc, "status_code", None)
                retryable = status in (408, 409, 429, 500, 502, 503, 504)
                if not retryable or attempt == 3:
                    raise
                await asyncio.sleep(2 ** attempt)
