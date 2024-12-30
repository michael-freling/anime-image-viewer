from transformers import ViTImageProcessor, ViTForImageClassification
import torch
import multiprocessing as mp
from ImageProcessor import ImageProcessor


class Inference:
    def __init__(self, model_path: str, resize_image_width: int):
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.processor = ViTImageProcessor.from_pretrained(
            model_path, device=device)
        self.model = ViTForImageClassification.from_pretrained(model_path)
        self.resize_image_width = resize_image_width

    def preprocess_image(self, image_path: str, target_width: int):
        with ImageProcessor(image_path) as processor:
            return processor.preprocess(target_width)

    def predict(self, image_paths: list[str]):
        images = []
        with mp.Pool(processes=mp.cpu_count()) as pool:
            images = pool.starmap(
                self.preprocess_image,
                [(image_path, self.resize_image_width)
                 for image_path in image_paths]
            )

        inputs = self.processor(
            images=images, return_tensors="pt")
        outputs = self.model(**inputs)

        # https://iifx.dev/en/articles/345450710
        probabilities = torch.sigmoid(outputs.logits)
        sorted_indices = torch.argsort(probabilities, descending=True)

        all_tags = self.model.config.id2label
        return {
            'scores': probabilities.tolist(),
            'sorted_indices': sorted_indices.tolist(),
            'tags': all_tags
        }
