import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.auth import hash_password
from services.db import get_connection


def main() -> int:
    if len(sys.argv) != 3:
      print("Usage: python3 -m scripts.reset_user_password <email> <new_password>")
      return 1

    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2]

    if len(new_password) < 8:
        print("Error: password must be at least 8 characters long.")
        return 1

    password_hash = hash_password(new_password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, full_name FROM users WHERE email = %s", (email,))
            user = cur.fetchone()
            if user is None:
                print(f"Error: no user found for {email}.")
                return 1

            cur.execute(
                """
                UPDATE users
                SET password_hash = %s
                WHERE email = %s
                """,
                (password_hash, email),
            )
        conn.commit()

    print(f"Password reset for {user['full_name']} <{user['email']}>.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
