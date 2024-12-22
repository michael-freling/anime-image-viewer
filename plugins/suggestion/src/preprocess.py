import os
import shutil
from PIL import Image
from torchvision import datasets
import multiprocessing as mp


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
                return f"Processed and resized: {file_path}"
        except (IOError, SyntaxError) as e:
            os.remove(file_path)
            return f"Removed corrupted image: {file_path}"

    def process_images(self, root_dir, destination_dir, target_width):
        image_paths = []
        metadata_file_paths = []
        for subdir, dirs, files in os.walk(root_dir):
            for file in files:
                if file.endswith('.jsonl') or file.endswith('.json'):
                    metadata_file_paths.append(os.path.join(subdir, file))
                    continue

                file_path = os.path.join(subdir, file)
                image_paths.append(file_path)

        os.mkdir(destination_dir)
        print(f"Processing {len(image_paths)} images...")
        with mp.Pool(processes=mp.cpu_count()) as pool:
            results = pool.starmap(
                self.process_image, [(path, destination_dir, target_width) for path in image_paths])

        for metadata_file in metadata_file_paths:
            file_name = os.path.basename(metadata_file)
            file_path = os.path.join(destination_dir, file_name)
            shutil.copy(metadata_file, file_path)

        dataset = datasets.ImageFolder(root=root_dir)
        print(f"Processed {len(results)} images in {len(dataset)} classes.")
