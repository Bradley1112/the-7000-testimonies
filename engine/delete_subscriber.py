#!/usr/bin/env python3
"""
Erase a subscriber's data on request.

    python engine/delete_subscriber.py someone@example.com
    python engine/delete_subscriber.py someone@example.com --yes   # skip the prompt

The brief asks for a simple way to fully delete a subscriber's data, as good
practice regardless of jurisdiction. This is a hard delete, not a status change:
after it runs there is no row, and the address is not retained on any
suppression list. That is the honest reading of "delete my data" — keeping the
address on file to remember not to email it would be keeping the address on file.

The practical consequence, which is worth telling the person: nothing stops them
subscribing again later, and nothing remembers that they left.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db  # noqa: E402
from config import config  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Permanently delete a subscriber.")
    ap.add_argument("email")
    ap.add_argument("--yes", action="store_true", help="Do not prompt for confirmation.")
    args = ap.parse_args()

    problems = config.validate()
    # Only the database matters here; a missing model key is irrelevant.
    fatal = [p for p in problems if "SUPABASE" in p]
    if fatal:
        for p in fatal:
            print(f"config error: {p}", file=sys.stderr)
        return 2

    email = args.email.strip().lower()
    client = db.client()

    existing = client.table("subscribers").select("id, email, status, subscribed_at") \
        .eq("email", email).execute().data

    if not existing:
        print(f"No subscriber found with address {email!r}. Nothing to delete.")
        return 0

    row = existing[0]
    print(f"Found: {row['email']}  status={row['status']}  subscribed={row['subscribed_at']}")

    if not args.yes:
        confirm = input("Permanently delete this subscriber? Type the email address to confirm: ")
        if confirm.strip().lower() != email:
            print("Confirmation did not match. Nothing was deleted.")
            return 1

    client.table("subscribers").delete().eq("id", row["id"]).execute()
    print(f"Deleted {email}. No record of this address remains.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
