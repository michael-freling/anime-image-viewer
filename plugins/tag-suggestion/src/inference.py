from transformers import ViTImageProcessor, ViTForImageClassification
from PIL import Image
import torch


class Inference:
    def __init__(self, model_path: str):
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.processor = ViTImageProcessor.from_pretrained(
            model_path, device=device)
        self.model = ViTForImageClassification.from_pretrained(model_path)

    def predict(self, image_paths: list[str]):
        image = [
            Image.open(image_path).convert('RGB') for image_path in image_paths
        ]
        inputs = self.processor(
            images=image, return_tensors="pt")
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
