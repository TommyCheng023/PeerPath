import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from services.auth import (
    authenticate_user,
    create_access_token,
    create_user,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/register", response_model=AuthResponse)
def register(request: RegisterRequest):
    user = create_user(
        email=request.email,
        full_name=request.full_name,
        password=request.password,
    )
    token = create_access_token(user)
    return AuthResponse(access_token=token, user=UserResponse(**user))


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest):
    user = authenticate_user(request.email, request.password)
    token = create_access_token(user)
    return AuthResponse(access_token=token, user=UserResponse(**user))


@router.get("/me", response_model=UserResponse)
def me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)


@router.post("/logout")
def logout():
    return {"ok": True}
