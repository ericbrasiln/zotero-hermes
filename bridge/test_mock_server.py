import unittest

from mock_server import audit_payload


class AuditPayloadTests(unittest.TestCase):
    def test_reports_missing_fields_and_duplicate_title(self):
        payload = {
            "collection": {"key": "TEST1234", "name": "Test"},
            "items": [
                {"key": "ITEM0001", "title": "Same", "creators": [], "ISBN": "bad"},
                {"key": "ITEM0002", "title": "Same", "creators": [{"lastName": "Doe"}]},
            ],
        }
        result = audit_payload(payload)
        kinds = {finding["kind"] for finding in result["findings"]}
        self.assertIn("missing_author", kinds)
        self.assertIn("missing_date", kinds)
        self.assertIn("duplicate_title", kinds)
        self.assertIn("suspicious_isbn", kinds)

    def test_empty_collection_has_no_findings(self):
        result = audit_payload({"collection": {"key": "TEST1234"}, "items": []})
        self.assertEqual(result["findings"], [])


if __name__ == "__main__":
    unittest.main()
