import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def _build_base_url(endpoint: str) -> str:
    normalized = endpoint.rstrip("/")
    if normalized.endswith("/openai/v1"):
        return normalized
    if normalized.endswith("/openai/v1/"):
        return normalized.rstrip("/")
    return f"{normalized}/openai/v1/"


def get_azure_openai_client() -> OpenAI:
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")

    if not endpoint:
        raise ValueError("Missing AZURE_OPENAI_ENDPOINT in backend/.env")
    if not api_key:
        raise ValueError("Missing AZURE_OPENAI_API_KEY in backend/.env")

    return OpenAI(
        api_key=api_key,
        base_url=_build_base_url(endpoint),
    )


def get_chat_model() -> str:
    deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")
    if not deployment:
        raise ValueError("Missing AZURE_OPENAI_CHAT_DEPLOYMENT in backend/.env")
    return deployment
