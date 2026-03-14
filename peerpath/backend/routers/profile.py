import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field, field_validator

from services.auth import get_current_user
from services.profile_options import (
    ALLOWED_COMFORT_LEVELS,
    ALLOWED_HELP_TOPICS,
    ALLOWED_TAGS,
    ALLOWED_YEARS,
)
from services.profile import get_profile, upsert_profile

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileRequest(BaseModel):
    major: str = Field(min_length=2, max_length=80)
    year: str
    tags: list[str] = Field(min_length=1)
    help_topics: list[str] = Field(min_length=1)
    comfort_level: str
    contact_phone: str = Field(min_length=7, max_length=30)
    contact_email: EmailStr
    past_challenge: str = Field(min_length=20, max_length=2000)
    searchable: bool = True

    @field_validator("year")
    @classmethod
    def validate_year(cls, value: str) -> str:
        if value not in ALLOWED_YEARS:
            raise ValueError("Invalid year selection.")
        return value

    @field_validator("comfort_level")
    @classmethod
    def validate_comfort_level(cls, value: str) -> str:
        if value not in ALLOWED_COMFORT_LEVELS:
            raise ValueError("Invalid comfort level selection.")
        return value

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: list[str]) -> list[str]:
        invalid = [value for value in values if value not in ALLOWED_TAGS]
        if invalid:
            raise ValueError(f"Invalid tags: {', '.join(invalid)}")
        return values

    @field_validator("help_topics")
    @classmethod
    def validate_help_topics(cls, values: list[str]) -> list[str]:
        invalid = [value for value in values if value not in ALLOWED_HELP_TOPICS]
        if invalid:
            raise ValueError(f"Invalid help topics: {', '.join(invalid)}")
        return values


@router.get("/me")
def profile_me(current_user: dict = Depends(get_current_user)):
    profile = get_profile(current_user["id"])
    return {"profile": profile}


@router.put("/me")
def update_profile(request: ProfileRequest, current_user: dict = Depends(get_current_user)):
    profile = upsert_profile(current_user["id"], request.model_dump())
    return {"profile": profile}
