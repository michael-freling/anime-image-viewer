import transformers
import datasets
import multiprocessing as mp
import evaluate
import numpy as np
import torch
import json

tags = [
    "cat",
    "dog",
    "cat 2"
]


class Trainer:
    model_name = 'google/vit-base-patch16-224-in21k'

    def __init__(self):
        self.processor = transformers.ViTImageProcessor.from_pretrained(
            self.model_name)

    def train(self, data_dir: str, model_dir: str):
        # with open(f'{data_dir}/tags.json', 'r') as f:
        #     tags = json.loads(f.read())

        def transform(batch):
            # The ViTImageProcessor struggles with RGBA images since it typically expects RGB images
            inputs = self.processor([x.convert("RGB")
                                     for x in batch['image']], return_tensors='pt')
            inputs['tags'] = batch['tags']
            return inputs

        ds = datasets.load_dataset('imagefolder',
                                   data_dir=data_dir,
                                   num_proc=mp.cpu_count())
        # ds = datasets.load_dataset('beans')
        prepared_ds = ds.with_transform(transform)

        # load_metric is deprecated https://discuss.huggingface.co/t/unable-to-import-load-metric/110268/3
        # metrics = evaluate.load("accuracy")
        # https://huggingface.co/blog/Valerii-Knowledgator/multi-label-classification
        metrics = evaluate.combine(["accuracy", "f1", "precision", "recall"])

        def sigmoid(x):
            return 1/(1 + np.exp(-x))

        def compute_metrics(p: transformers.EvalPrediction):
            # return metrics.compute(predictions=np.argmax(p.predictions, axis=1), references=p.label_ids)

            predictions, labels = p
            predictions = sigmoid(predictions)
            predictions = (predictions > 0.5).astype(int).reshape(-1)
            references = labels.astype(int).reshape(-1)
            return metrics.compute(predictions=predictions, references=references)

        def collate_fn(batch):
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
        )

        training_args = transformers.TrainingArguments(
            output_dir=model_dir,
            fp16=True,

            # For testing
            # save_steps=2,
            # eval_steps=2,
            # logging_steps=1,
            # learning_rate=2e-4,
            # save_total_limit=2,

            remove_unused_columns=False,
            #   push_to_hub=False,
            #   report_to='tensorboard',
            load_best_model_at_end=True,
            eval_strategy="steps",
            # Data Preloading parameters: https://huggingface.co/docs/transformers/perf_train_gpu_one
            dataloader_num_workers=4,
        )

        trainer = transformers.Trainer(
            model=model,
            args=training_args,
            data_collator=collate_fn,
            compute_metrics=compute_metrics,
            train_dataset=prepared_ds["train"],
            eval_dataset=prepared_ds["validation"],
            tokenizer=self.processor,
        )
        train_results = trainer.train()
        trainer.save_model()
        trainer.log_metrics("train", train_results.metrics)
        trainer.save_metrics("train", train_results.metrics)
        trainer.save_state()

        metrics_result = trainer.evaluate(prepared_ds['validation'])
        trainer.log_metrics("eval", metrics_result)
        trainer.save_metrics("eval", metrics_result)
