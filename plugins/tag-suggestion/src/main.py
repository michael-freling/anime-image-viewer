import json
import click
import transformers
import inference
from grpc_server import start_grpc_server
import preprocess
from tools import DatasetImageExtractor
import train
from ImageProcessor import ImageProcessor
from transformers import HfArgumentParser


@click.group()
def cli():
    pass


@cli.command('preprocess')
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
@click.option('--target-image-width', default=224, help='Width to resize the images to')
def preprocess_data(input_dir: str, output_dir: str, target_image_width: int):
    preprocessor = preprocess.Preprocessor()
    preprocessor.process_images(input_dir, output_dir, target_image_width)


@cli.command('train', context_settings=dict(ignore_unknown_options=True, allow_extra_args=True))
@click.argument('input_dir', type=click.Path(exists=True))
@click.pass_context
def train_model(ctx, input_dir: str):
    parser = transformers.HfArgumentParser((transformers.TrainingArguments))
    training_args = parser.parse_args_into_dataclasses(args=ctx.args)[0]
    trainer = train.Trainer()
    trainer.train(input_dir, training_args)


@cli.command('predict')
@click.argument('model_path', type=click.Path(exists=True))
@click.argument('image_paths', type=click.Path(exists=True), nargs=-1)
@click.option('--resize-image-width', default=224, help='Width to resize the input images to')
def predict_image(model_path: str, image_paths: list[str], resize_image_width: int):
    inferer = inference.Inference(model_path, resize_image_width)
    print(json.dumps(inferer.predict(image_paths), indent=2))


@cli.command('server')
@click.argument('model_path', type=click.Path(exists=True))
@click.option('--resize-image-width', default=224, help='Width to resize the input images to')
def server(model_path: str, resize_image_width: int):
    start_grpc_server(model_path, resize_image_width)


@cli.command('extract')
@click.argument('data_dir', type=click.Path(exists=True))
def extract(data_dir: str):
    DatasetImageExtractor().show_images(data_dir)


if __name__ == '__main__':
    try:
        cli()
    except Exception as e:
        print(e)
        exit(1)
