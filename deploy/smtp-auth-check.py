#!/usr/bin/env python3
"""Verifică autentificarea SMTP din mail.env fără a trimite mesaje."""

import smtplib
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


def main() -> None:
    values = {}
    for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
        if line and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value

    endpoint = urlparse(values["MAIL_URL"])
    username = unquote(endpoint.username or "")
    password = unquote(endpoint.password or "")
    port = endpoint.port or (465 if endpoint.scheme == "smtps" else 587)
    if endpoint.scheme == "smtps":
        client = smtplib.SMTP_SSL(endpoint.hostname, port, timeout=15)
    else:
        client = smtplib.SMTP(endpoint.hostname, port, timeout=15)
        client.starttls()
    try:
        client.login(username, password)
    finally:
        client.quit()
    print("smtp-auth:ok")


if __name__ == "__main__":
    main()
