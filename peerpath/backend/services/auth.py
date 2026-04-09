import os
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from services.db import get_connection

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def _get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")


def _get_jwt_algorithm() -> str:
    return "HS256"


def _get_expiry_minutes() -> int:
    return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_user(email: str, full_name: str, password: str) -> dict:
    user = {
        "id": str(uuid.uuid4()),
        "email": email.strip().lower(),
        "full_name": full_name.strip(),
        "password_hash": hash_password(password),
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (user["email"],))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                )

            cur.execute(
                """
                INSERT INTO users (id, email, full_name, password_hash)
                VALUES (%(id)s, %(email)s, %(full_name)s, %(password_hash)s)
                """,
                user,
            )
        conn.commit()

    return {"id": user["id"], "email": user["email"], "full_name": user["full_name"]}


def get_user_by_email(email: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, full_name, password_hash, created_at
                FROM users
                WHERE email = %s
                """,
                (email.strip().lower(),),
            )
            return cur.fetchone()


def get_user_by_id(user_id: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, full_name, created_at
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            )
            return cur.fetchone()


def authenticate_user(email: str, password: str) -> dict:
    user = get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return {"id": user["id"], "email": user["email"], "full_name": user["full_name"]}


def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=_get_expiry_minutes())).timestamp()),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm=_get_jwt_algorithm())


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, _get_jwt_secret(), algorithms=[_get_jwt_algorithm()])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return user


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    if credentials is None:
        return None
    return get_current_user(credentials)
