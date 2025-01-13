import os
import shutil
# from torchvision import datasets
import multiprocessing as mp
import datasets
from PIL import Image
from typing import TypedDict


class DatasetDict(TypedDict):
    image: list[Image.Image]
    tags: list[list[int]]


class Preprocessor:
    def __init__(self):
        pass

    def process_images(self, root_dir, root_destination_dir, target_width):
        def preprocess(chunk: DatasetDict) -> DatasetDict:
            result = {
                'image': [],
                'tags': []
            }

            for index in range(len(chunk['image'])):
                image = chunk['image'][index]
                tags = chunk['tags'][index]

                # aspect_ratio = target_width / float(image.size[0])
                target_height = int(
                    float(image.size[1]) * target_width /
                    float(image.size[0])
                )
                # rotate images before losing pixels
                for angle in range(0, 360, 45):
                    # The ViTImageProcessor struggles with RGBA images since it typically expects RGB images
                    copied = image.copy().rotate(angle).resize(
                        (target_width, target_height), Image.LANCZOS).convert('RGB')

                    result['image'].append(copied)
                    result['tags'].append(tags)

            return result

        ds = datasets.load_dataset(
            'imagefolder', data_dir=root_dir, num_proc=mp.cpu_count())
        # To avoid a crash, set a smaller batch size
        ds = ds.map(preprocess, batched=True,
                    batch_size=20, num_proc=mp.cpu_count())
        splitted = ds['train'].train_test_split(test_size=0.2)
        result = datasets.DatasetDict({
            'train': splitted['train'],
            'validation': splitted['test']
        })
        result.save_to_disk(root_destination_dir)

        tags_file = os.path.join(root_dir, 'tags.json')
        shutil.copy(tags_file, os.path.join(
            root_destination_dir, os.path.basename(tags_file)))
