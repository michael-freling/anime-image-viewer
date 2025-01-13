import os
import tempfile
import unittest
import datasets
import preprocess
from test_config import TESTDATA_DIR


class TestPreprocessor(unittest.TestCase):
    def test_preprocess(self):
        output_dir = tempfile.mkdtemp()
        expected_image_width = 1
        preprocess.Preprocessor().process_images(
            TESTDATA_DIR,
            output_dir,
            expected_image_width,
        )

        self.assertTrue(os.path.isfile(os.path.join(output_dir, 'tags.json')))

        expected_image_count = 2 * (360 / 45)
        actual = datasets.load_from_disk(output_dir)
        self.assertIn('train', actual.keys())
        actual_image_count = sum([len(actual[split]['image'])
                                  for split in actual])
        self.assertEqual(expected_image_count,
                         actual_image_count)

        for actual_image in actual['train']['image']:
            self.assertEqual(expected_image_width,
                             actual_image.size[0])
