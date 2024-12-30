import os
import shutil
from PIL import Image
from torchvision import datasets
import multiprocessing as mp
import json


class Preprocessor:
    def __init__(self):
        pass

    def resize_image(self, img, target_width):
        w_percent = target_width / float(img.size[0])
        target_height = int(float(img.size[1]) * float(w_percent))
        return img.resize((target_width, target_height), Image.LANCZOS)

    def process_image(self, file_path, output_dir, target_width):
        try:
            with Image.open(file_path) as img:
                img.verify()

            with Image.open(file_path) as img:
                resized_img = self.resize_image(img, target_width)
                file_name = os.path.basename(file_path)
                file_path = os.path.join(output_dir, file_name)
                resized_img.save(file_path)
            return file_path
        except (IOError, SyntaxError) as e:
            print(f"Corrupted image: {file_path} as {e}")
            # os.remove(file_path)

    def process_images(self, root_dir, root_destination_dir, target_width):
        splits = ['train', 'validation']
        image_paths = {}
        tags_file = os.path.join(root_dir, 'tags.json')
        metadata_file_paths = {}
        for split in splits:
            metadata_file_paths[split] = os.path.join(
                root_dir, split, 'metadata.jsonl',
            )
            image_paths[split] = []
            for subdir, dirs, files in os.walk(os.path.join(root_dir, split)):
                for file in files:
                    if file.endswith('.jsonl') or file.endswith('.json'):
                        continue
                    file_path = os.path.join(subdir, file)
                    image_paths[split].append(file_path)

        for split in splits:
            image_destination_dir = os.path.join(root_destination_dir, split)
            os.makedirs(image_destination_dir)
            split_image_paths = image_paths[split]
            print(f"{split} dataset: Processing {
                  len(split_image_paths)} images...")

            metadata_file = metadata_file_paths[split]
            with mp.Pool(processes=mp.cpu_count()) as pool:
                results = pool.starmap(
                    self.process_image, [(path, image_destination_dir, target_width) for path in split_image_paths])
                results = [os.path.basename(result)
                           for result in results if result is not None]

                output_file_path = os.path.join(
                    image_destination_dir, os.path.basename(metadata_file))
                with open(metadata_file, 'r') as f, open(output_file_path, 'w') as f_out:
                    for line in f:
                        data = json.loads(line)
                        if data['file_name'] in results:
                            f_out.write(line)

        shutil.copy(tags_file, os.path.join(
            root_destination_dir, os.path.basename(tags_file)))
        dataset = datasets.ImageFolder(root=root_dir)
        print(f"Processed {len(results)} images in {
              len(dataset)} classes.")
