from src.utils.crypto import compute_audit_checksum, verify_audit_chain


class FakeAuditEntry:
    def __init__(self, checksum: str, details: dict):
        self.checksum = checksum
        self.details = details


class TestAuditChecksum:
    def test_deterministic(self):
        c1 = compute_audit_checksum("GENESIS", {"event": "test"})
        c2 = compute_audit_checksum("GENESIS", {"event": "test"})
        assert c1 == c2

    def test_different_input_different_hash(self):
        c1 = compute_audit_checksum("GENESIS", {"event": "test1"})
        c2 = compute_audit_checksum("GENESIS", {"event": "test2"})
        assert c1 != c2

    def test_chain_depends_on_previous(self):
        c1 = compute_audit_checksum("AAA", {"event": "test"})
        c2 = compute_audit_checksum("BBB", {"event": "test"})
        assert c1 != c2


class TestVerifyAuditChain:
    def test_empty_chain_valid(self):
        is_valid, broken = verify_audit_chain([])
        assert is_valid
        assert broken is None

    def test_single_entry_valid(self):
        details = {"event": "memory_validated"}
        checksum = compute_audit_checksum("GENESIS", details)
        entries = [FakeAuditEntry(checksum, details)]
        is_valid, broken = verify_audit_chain(entries)
        assert is_valid

    def test_multi_entry_chain_valid(self):
        entries = []
        prev = "GENESIS"
        for i in range(5):
            details = {"event": f"event_{i}"}
            checksum = compute_audit_checksum(prev, details)
            entries.append(FakeAuditEntry(checksum, details))
            prev = checksum

        is_valid, broken = verify_audit_chain(entries)
        assert is_valid

    def test_tampered_entry_detected(self):
        entries = []
        prev = "GENESIS"
        for i in range(5):
            details = {"event": f"event_{i}"}
            checksum = compute_audit_checksum(prev, details)
            entries.append(FakeAuditEntry(checksum, details))
            prev = checksum

        # Tamper with entry 2
        entries[2].details = {"event": "TAMPERED"}

        is_valid, broken = verify_audit_chain(entries)
        assert not is_valid
        assert broken == 2

    def test_deleted_entry_detected(self):
        entries = []
        prev = "GENESIS"
        for i in range(5):
            details = {"event": f"event_{i}"}
            checksum = compute_audit_checksum(prev, details)
            entries.append(FakeAuditEntry(checksum, details))
            prev = checksum

        # Delete entry 1
        del entries[1]

        is_valid, broken = verify_audit_chain(entries)
        assert not is_valid
