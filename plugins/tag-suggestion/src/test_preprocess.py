import json
import os
import tempfile
import unittest
from PIL import Image
import preprocess


TESTDATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'testdata')


class TestPreprocessor(unittest.TestCase):
    testdata_dir = TESTDATA_DIR

    def setUp(self):
        print(TESTDATA_DIR)

    def test_preprocess(self):
        output_dir = tempfile.mkdtemp()
        expected_image_width = 1
        preprocess.Preprocessor().process_images(
            self.testdata_dir,
            output_dir,
            expected_image_width,
        )

        expected_files = {}
        with open(os.path.join(self.testdata_dir, 'tags.json'), 'r') as tagJson, open(os.path.join(self.testdata_dir, 'train', 'metadata.jsonl'), 'r') as metadataJson:
            metadata = ""

            for line in metadataJson:
                jsonLine = json.loads(line)
                if jsonLine["file_name"] == "invalid_image.svg":
                    continue
                metadata += line

            expected_files = {
                output_dir: {
                    'tags.json': tagJson.read()
                },
                os.path.join(output_dir, 'train'): {
                    'image.jpg': None,
                    'image.png': None,
                    'metadata.jsonl': metadata
                },
                os.path.join(output_dir, 'validation'): {}
            }

        for subdir, _, files in os.walk(output_dir):
            self.assertEqual(
                sorted(expected_files[subdir].keys()), sorted(files)
            )
            for file in files:
                expected_file = expected_files[subdir][file]
                if expected_file is None:
                    actual_image = Image.open(os.path.join(subdir, file))
                    self.assertEqual(
                        expected_image_width,
                        actual_image.size[0]
                    )
                    continue

                with open(os.path.join(subdir, file), 'r') as f:
                    actual = f.read()
                    self.assertEqual(
                        expected_file, actual
                    )
