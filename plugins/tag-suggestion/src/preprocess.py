import os
import shutil
from torchvision import datasets
import multiprocessing as mp
import json
from ImageProcessor import ImageProcessor


class Preprocessor:
    def __init__(self):
        pass

    def process_image(self, file_path, output_dir, target_width):
        try:
            with ImageProcessor(file_path) as processor:
                img = processor.preprocess(target_width)
                output_file_path = os.path.join(
                    output_dir, os.path.basename(file_path))
                img.save(output_file_path)
                return output_file_path
        except (IOError, SyntaxError) as e:
            print(f"Corrupted image: {file_path}")
            print(e)

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

            if len(split_image_paths) == 0:
                print(
                    f"Warning: No images found in {split} dataset. Skipping...")
                continue

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
