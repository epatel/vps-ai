import asyncio
import os
import tempfile
import unittest
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import Database


class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = Database(self.tmp.name)
        asyncio.get_event_loop().run_until_complete(self.db.init())

    def tearDown(self):
        asyncio.get_event_loop().run_until_complete(self.db.close())
        os.unlink(self.tmp.name)

    def run_async(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_create_room_with_pairing_code(self):
        room = self.run_async(self.db.create_room())
        self.assertIsNotNone(room["id"])
        self.assertIsNotNone(room["pairing_code"])
        self.assertEqual(len(room["pairing_code"]), 6)
        self.assertIsNotNone(room["token_a"])
        self.assertEqual(len(room["token_a"]), 32)

    def test_find_room_by_pairing_code(self):
        room = self.run_async(self.db.create_room())
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertEqual(found["id"], room["id"])

    def test_complete_pairing(self):
        room = self.run_async(self.db.create_room())
        token_b = self.run_async(self.db.complete_pairing(room["id"]))
        self.assertEqual(len(token_b), 32)
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertIsNone(found)

    def test_find_room_by_token(self):
        room = self.run_async(self.db.create_room())
        token_b = self.run_async(self.db.complete_pairing(room["id"]))
        found_a = self.run_async(self.db.find_room_by_token(room["token_a"]))
        self.assertEqual(found_a["id"], room["id"])
        found_b = self.run_async(self.db.find_room_by_token(token_b))
        self.assertEqual(found_b["id"], room["id"])

    def test_expired_pairing_code_not_found(self):
        room = self.run_async(self.db.create_room(code_ttl_seconds=0))
        time.sleep(0.1)
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertIsNone(found)

    def test_add_and_get_items(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        item_id = self.run_async(
            self.db.add_item(room["id"], "text", "Hello world", "phone")
        )
        self.assertIsInstance(item_id, int)
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["content"], "Hello world")
        self.assertEqual(items[0]["type"], "text")
        self.assertEqual(items[0]["sender"], "phone")

    def test_get_items_since(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        id1 = self.run_async(self.db.add_item(room["id"], "text", "First", "phone"))
        id2 = self.run_async(self.db.add_item(room["id"], "link", "https://example.com", "phone"))
        items = self.run_async(self.db.get_items(room["id"], since_id=id1))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["content"], "https://example.com")

    def test_delete_item(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        item_id = self.run_async(self.db.add_item(room["id"], "text", "Delete me", "phone"))
        self.run_async(self.db.delete_item(room["id"], item_id))
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 0)

    def test_clear_items(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        self.run_async(self.db.add_item(room["id"], "text", "One", "phone"))
        self.run_async(self.db.add_item(room["id"], "text", "Two", "phone"))
        self.run_async(self.db.clear_items(room["id"]))
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 0)

    def test_add_item_with_metadata(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        metadata = '{"size": 1024, "mime": "image/png", "filename": "photo.png"}'
        item_id = self.run_async(
            self.db.add_item(room["id"], "image", "abc123.png", "phone", metadata=metadata)
        )
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(items[0]["metadata"], metadata)


if __name__ == "__main__":
    unittest.main()
