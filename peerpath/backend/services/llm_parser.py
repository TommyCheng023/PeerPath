import json
import os

import anthropic
from dotenv import load_dotenv

# Load .env from backend root (one level up from services/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

VALID_CONTEXT = [
    "transfer adjustment", "freshman adjustment", "academic stress",
    "course registration", "campus navigation", "social life",
    "dating", "internship search", "research decisions",
    "housing", "international student adjustment", "changing majors",
]

VALID_STRUGGLE_TYPE = [
    "social isolation", "procedural confusion", "academic difficulty",
    "anxiety", "burnout", "lack of information", "difficulty adapting",
    "relationship confusion", "time management", "financial stress",
]

VALID_EMOTIONAL_SIGNAL = [
    "lonely", "overwhelmed", "frustrated", "uncertain",
    "anxious", "lost", "stressed", "hopeful", "confused",
]

VALID_HELP_NEEDED = [
    "reassurance", "step-by-step advice", "peer experience",
    "practical tips", "emotional support", "introductions to people",
    "information about resources",
]

_ENUM_MAP = {
    "context": VALID_CONTEXT,
    "struggle_type": VALID_STRUGGLE_TYPE,
    "emotional_signal": VALID_EMOTIONAL_SIGNAL,
    "help_needed": VALID_HELP_NEEDED,
}

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "parse_challenge.txt")


def _load_prompt(user_description: str) -> str:
    with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
        template = f.read()
    return template.format(user_description=user_description)


def parse_challenge(user_description: str) -> dict:
    """Parse a student's free-text description into a structured Challenge Profile.

    Returns a dict with keys: context, struggle_type, emotional_signal, help_needed.
    Raises ValueError if the API response cannot be parsed as JSON.
    """
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt = _load_prompt(user_description)

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=256,
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )

    raw_text = response.content[0].text.strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"[llm_parser] JSON parse error: {e}\nRaw response:\n{raw_text}")
        raise ValueError(f"LLM returned invalid JSON: {e}") from e

    # Validate each field against its enum pool
    for field, valid_values in _ENUM_MAP.items():
        value = parsed.get(field)
        if value not in valid_values:
            print(f"[llm_parser] WARNING: field '{field}' has unexpected value '{value}'. "
                  f"Valid values: {valid_values}")

    return parsed


if __name__ == "__main__":
    test_inputs = [
        "I just transferred here and I'm struggling to make friends.",
        "I have no idea how to register for classes, the system is so confusing.",
        "Dating in college feels really weird and I don't know how to meet people.",
    ]

    for description in test_inputs:
        print(f"\nInput: {description!r}")
        result = parse_challenge(description)
        print(json.dumps(result, indent=2))
