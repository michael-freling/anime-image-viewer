import click

import preprocess
import train


@click.group()
def cli():
    pass


@cli.command('preprocess')
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
@click.option('--target_width', default=512, help='Width to resize the images to')
def preprocess_data(input_dir: str, output_dir: str, target_width: int):
    preprocessor = preprocess.Preprocessor()
    preprocessor.process_images(input_dir, output_dir, target_width)


@cli.command('train')
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
def train_model(input_dir: str, output_dir: str):
    trainer = train.Trainer()
    trainer.train(input_dir, output_dir)


if __name__ == '__main__':
    cli()
