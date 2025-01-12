import sys
import PIL.PngImagePlugin
import transformers
import datasets
import multiprocessing as mp
import evaluate
import numpy as np
import torch
from tag import TagReader

import logging
# logging.basicConfig(level=logging.INFO)


class Trainer:
    model_name = 'google/vit-base-patch16-224'

    def __init__(self):
        self.processor = transformers.ViTImageProcessor.from_pretrained(
            self.model_name,
            device='cuda' if torch.cuda.is_available() else 'cpu'
        )

    def set_logger(self, training_args: transformers.TrainingArguments):
        # https://huggingface.co/docs/transformers/v4.47.1/en/trainer#logging
        logger = logging.getLogger(__name__)

        logging.basicConfig(
            format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
            datefmt="%m/%d/%Y %H:%M:%S",
            handlers=[logging.StreamHandler(sys.stdout)],
        )

        log_level = training_args.get_process_log_level()
        logger.setLevel(log_level)
        datasets.utils.logging.set_verbosity(log_level)
        transformers.utils.logging.set_verbosity(log_level)
        return logger

    def train(self, data_dir: str, training_args: transformers.TrainingArguments):
        tag_reader = TagReader(f'{data_dir}/tags.json')
        tags = tag_reader.read_flatten_tags()

        def transform(batch):
            processed_images = [image for image in batch['image']]
            inputs = self.processor(processed_images, return_tensors='pt')
            inputs['tags'] = [
                [float(int_val) for int_val in tag_flags] for tag_flags in batch['tags']
            ]
            return inputs

        ds = datasets.load_dataset('imagefolder',
                                   data_dir=data_dir,
                                   num_proc=mp.cpu_count())
        # The ViTImageProcessor struggles with RGBA images since it typically expects RGB images
        ds = ds.cast_column("image", datasets.Image(mode="RGB"))
        prepared_ds = ds.with_transform(transform)

        # https://huggingface.co/blog/Valerii-Knowledgator/multi-label-classification
        metrics = evaluate.combine(["accuracy", "f1", "precision", "recall"])

        def sigmoid(x):
            return 1/(1 + np.exp(-x))

        def compute_metrics(p: transformers.EvalPrediction):
            predictions, labels = p
            predictions = sigmoid(predictions)
            predictions = (predictions > 0.5).astype(int).reshape(-1)
            references = labels.astype(int).reshape(-1)
            return metrics.compute(predictions=predictions, references=references)

        def collate_fn(batch):
            batch = list(filter(lambda x: x is not None, batch))
            return {
                'pixel_values': torch.stack([x['pixel_values'] for x in batch]),
                'labels': torch.tensor([x['tags'] for x in batch]),
            }

        model = transformers.ViTForImageClassification.from_pretrained(
            self.model_name,
            # Multi label classification: https://github.com/huggingface/transformers/issues/16003#issuecomment-1062714136
            problem_type="multi_label_classification",
            num_labels=len(tags),
            id2label={str(i): c for i, c in enumerate(tags)},
            label2id={c: str(i) for i, c in enumerate(tags)},

            # Avoid size mismatch errors
            ignore_mismatched_sizes=True,
        )

        has_validation_dataset = 'validation' in prepared_ds
        self.set_logger(training_args)

        trainer = transformers.Trainer(
            model=model,
            args=training_args,
            data_collator=collate_fn,
            compute_metrics=compute_metrics,
            train_dataset=prepared_ds["train"],
            eval_dataset=prepared_ds['validation'] if has_validation_dataset else prepared_ds["train"],
            tokenizer=self.processor,
        )
        train_results = trainer.train()
        trainer.save_model()
        trainer.log_metrics("train", train_results.metrics)
        trainer.save_metrics("train", train_results.metrics)
        trainer.save_state()

        metrics_result = trainer.evaluate(
            prepared_ds['validation' if has_validation_dataset else 'train'])
        trainer.log_metrics("eval", metrics_result)
        trainer.save_metrics("eval", metrics_result)
