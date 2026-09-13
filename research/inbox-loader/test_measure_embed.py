import unittest

from measure_embed import pick_samples


class PickSamples(unittest.TestCase):
    def test_returns_the_longest_record_and_a_batch_of_long_ones(self):
        recs = [{'text_vi': 'a' * 100}, {'text_vi': 'b' * 9000}, {'text_vi': 'c' * 48000}, {'text_vi': 'd' * 8500}]
        longest, batch = pick_samples(recs, batch=32, min_chars=8000)
        self.assertEqual(len(longest['text_vi']), 48000)
        self.assertEqual(sorted(len(r['text_vi']) for r in batch), [8500, 9000, 48000])

    def test_batch_is_capped(self):
        recs = [{'text_vi': 'x' * 9000} for _ in range(50)]
        _, batch = pick_samples(recs, batch=32, min_chars=8000)
        self.assertEqual(len(batch), 32)


if __name__ == '__main__':
    unittest.main()
