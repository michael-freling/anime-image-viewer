import PIL


class ImageProcessor:
    def __init__(self, image_path: str):
        self.image_path = image_path
        self.image = None

    def __enter__(self):
        with PIL.Image.open(self.image_path) as img:
            img.verify()
        self.image = PIL.Image.open(self.image_path)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.image.close()

    def preprocess(self, target_width: int):
        # w_percent = target_width / float(self.image.size[0])
        target_height = int(
            float(self.image.size[1]) * target_width /
            float(self.image.size[0])
        )
        return self.image.resize((target_width, target_height), PIL.Image.LANCZOS).convert('RGB')
