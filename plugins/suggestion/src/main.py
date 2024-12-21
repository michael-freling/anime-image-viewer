import click

import train

@click.group()
def cli():
    pass


@cli.command()
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
def preprocess(input_dir: str, output_dir: str):
    print(f'Preprocessing data')


@cli.command('train')
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
def train_model(input_dir: str, output_dir: str):
    trainer = train.Trainer()
    trainer.train(input_dir, output_dir)


if __name__ == '__main__':
    cli()
