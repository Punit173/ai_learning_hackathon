import json
import os
import re
from dotenv import load_dotenv
import asyncio

load_dotenv()

import google.generativeai as genai

from models import DialogueTurn


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

SYSTEM_PROMPT = """You are an expert dialogue writer. Your job is to take the provided 
text and transform it into an engaging, natural-sounding conversation between **two professionals** 
discussing the topic (e.g., colleagues, experts, or industry peers).

Rules:
1. **Speaker 1** and **Speaker 2** are both knowledgeable but may have different perspectives or focus areas.
2. The tone should be professional yet conversational, suitable for a workplace or industry podcast.
3. Avoid "teaching" or "interviewing" styles. Instead, have them **collaborate**, **debate**, or **analyze** the content together.
4. Cover ALL the key points from the source text; do not invent facts.
5. Aim for 6-12 dialogue turns (depending on the length of the input).
6. Return ONLY a JSON array — no markdown fences, no extra text.

Output format (strict JSON):
[
  {"speaker": "Speaker 1", "text": "..."},
  {"speaker": "Speaker 2", "text": "..."},
  ...
]"""


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def _extract_json_array(raw: str) -> list[dict]:
    """
    Best-effort extraction of a JSON array from the LLM response.
    Handles cases where the model wraps the output in markdown code fences.
    """
    # Try direct parse first
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences if present  (```json ... ```)
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Last resort: find first [ ... ] block
    start = raw.find("[")
    end = raw.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not parse a valid JSON array from the model response.")


def _chunk_text(text: str, chunk_size: int = 10000) -> list[str]:
    """
    Splits text into chunks of approximately `chunk_size` characters.
    Tries to split at newlines to keep paragraphs intact.
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    current_chunk = []
    current_length = 0
    
    # Split by paragraphs or newlines
    paragraphs = text.split('\n')
    
    for para in paragraphs:
        # +1 for the newline check approximation
        if current_length + len(para) + 1 > chunk_size and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = []
            current_length = 0
        
        current_chunk.append(para)
        current_length += len(para) + 1
        
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    return chunks


import unicodedata

def _clean_text(text: str) -> str:
    """
    Cleans raw text from PDFs or web scraping.
    - Normalizes Unicode characters (NFKC).
    - Removes non-printable control characters.
    - Fixes common PDF artifacts (broken hyphenation).
    - Collapses excessive whitespace (preserving paragraph breaks).
    """
    if not text:
        return ""

    # Normalize unicode to fix separation interactions
    text = unicodedata.normalize('NFKC', text)

    # Remove null bytes and replacement chars
    text = text.replace('\x00', '').replace('\ufffd', '')

    # Fix broken hyphenation often found in PDFs (word-\nbreak -> wordbreak)
    # matching hyphen, optional space, newline, optional space
    text = re.sub(r'-\s*\n\s*', '', text)

    # Replace runs of whitespace (tabs, non-breaking spaces) with single space
    # BUT we want to keep newlines for paragraph structure, so exclude \n from the set
    # [^\S\r\n] matches any whitespace except \r and \n
    text = re.sub(r'[^\S\r\n]+', ' ', text)

    # Optional: Collapse multiple newlines to max 2 (paragraph break)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


async def generate_dialogue(text: str) -> list[DialogueTurn]:
    """
    Send the input text to Google Gemini and return a list of DialogueTurns.
    Handles long text by chunking, rate limiting, and API key rotation.
    """
    # Clean up the input text first
    text = _clean_text(text)

    api_keys_str = os.getenv("GEMINI_API_KEY", "")
    if not api_keys_str:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set. "
            "Please set it before starting the service."
        )

    # Parse multiple keys (comma-separated)
    api_keys = [k.strip() for k in api_keys_str.split(",") if k.strip()]
    if not api_keys:
         raise RuntimeError("No valid API keys found in GEMINI_API_KEY.")
    
    import itertools
    key_cycle = itertools.cycle(api_keys)

    chunks = _chunk_text(text)
    full_dialogue_data: list[dict] = []
    previous_context = ""
    
    print(f"Processing {len(chunks)} chunks with {len(api_keys)} API keys...")

    for i, chunk in enumerate(chunks):
        # Rotate API Key
        current_key = next(key_cycle)
        genai.configure(api_key=current_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )

        if i > 0:
            # Rate limiting: mostly relying on key rotation, but a small buffer is good
            # If we have many keys, we might not need to sleep as much.
            # But to be safe and avoid hitting checking limits too hard:
            delay = 2.0 / len(api_keys) if len(api_keys) > 0 else 2.0
            # Cap delay at 0.5s minimum to avoid spamming even with many keys
            delay = max(delay, 0.5) 
            
            print(f"Waiting {delay:.2f}s before processing chunk {i+1} using key ...{current_key[-4:]}...")
            await asyncio.sleep(delay)
        else:
            print(f"Processing chunk {i+1} using key ...{current_key[-4:]}...")

        step_prompt = ""
        if len(chunks) > 1:
            step_prompt = f"(Part {i+1} of {len(chunks)}) "
            if i > 0:
                step_prompt += (
                    f"Continue the conversation based on the previous context:\n"
                    f"Context: {previous_context[-500:]}...\n\n"
                    f"Do NOT re-introduce the speakers. Jump straight into discussion.\n"
                )
        
        user_prompt = (
            f"{step_prompt}Convert the following text into a podcast dialogue:\n\n"
            f"---\n{chunk}\n---"
        )

        try:
            response = await model.generate_content_async(user_prompt)
            turns = _extract_json_array(response.text)
            
            # Simple validation to ensure it's a list
            if isinstance(turns, list):
                full_dialogue_data.extend(turns)
                
                # Update context for next iteration
                # We take the text of the last few turns
                last_turns_text = " ".join([t.get("text", "") for t in turns[-2:]])
                previous_context = last_turns_text
                
        except Exception as e:
            print(f"Error processing chunk {i+1} with key ...{current_key[-4:]}: {e}")
            # Continue to next chunk or raise?
            pass

    # Validate and convert to DialogueTurn objects
    dialogue: list[DialogueTurn] = []
    for turn in full_dialogue_data:
        dialogue.append(
            DialogueTurn(
                speaker=turn.get("speaker", "Speaker 1"),
                text=turn.get("text", ""),
            )
        )

    return dialogue
