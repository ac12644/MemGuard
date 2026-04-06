import base64
import hashlib
import json
import os
from typing import Optional

from src.config import settings


def compute_audit_checksum(previous_checksum: str, event_data: dict) -> str:
    """Blockchain-style chaining: each entry's checksum depends on the previous one."""
    payload = json.dumps(
        {"previous": previous_checksum, "event": event_data},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def verify_audit_chain(audit_entries: list) -> tuple[bool, Optional[int]]:
    """Verify the entire audit chain. Returns (is_valid, first_broken_index)."""
    for i, entry in enumerate(audit_entries):
        expected_prev = "GENESIS" if i == 0 else audit_entries[i - 1].checksum
        expected = compute_audit_checksum(expected_prev, entry.details)
        if entry.checksum != expected:
            return False, i
    return True, None


# --- Connector secret encryption (AES-like using XOR + HMAC for integrity) ---
# For production, replace with Fernet or AWS KMS. This provides basic at-rest protection.

def _derive_key() -> bytes:
    """Derive a 32-byte key from the app secret."""
    return hashlib.sha256(settings.memguard_secret_key.encode()).digest()


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value. Returns base64-encoded ciphertext with salt prefix."""
    key = _derive_key()
    salt = os.urandom(16)
    # XOR-based stream cipher with HMAC
    key_stream = hashlib.sha256(key + salt).digest() * ((len(plaintext) // 32) + 1)
    cipher_bytes = bytes(a ^ b for a, b in zip(plaintext.encode(), key_stream))
    hmac_val = hashlib.sha256(key + salt + cipher_bytes).digest()[:8]
    return base64.b64encode(salt + hmac_val + cipher_bytes).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a value encrypted by encrypt_value."""
    key = _derive_key()
    raw = base64.b64decode(ciphertext)
    salt = raw[:16]
    stored_hmac = raw[16:24]
    cipher_bytes = raw[24:]
    # Verify integrity
    expected_hmac = hashlib.sha256(key + salt + cipher_bytes).digest()[:8]
    if stored_hmac != expected_hmac:
        raise ValueError("Decryption failed: integrity check failed")
    key_stream = hashlib.sha256(key + salt).digest() * ((len(cipher_bytes) // 32) + 1)
    plaintext = bytes(a ^ b for a, b in zip(cipher_bytes, key_stream))
    return plaintext.decode()


def mask_secret(value: str, visible: int = 4) -> str:
    """Mask a secret string, showing only the last N characters."""
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]
