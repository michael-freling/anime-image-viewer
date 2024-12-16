import click

@click.group()
def preprocess_cli():
    pass

@preprocess_cli.command()
@click.argument('input_dir', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
def preprocess(input_dir: str, output_dir: str):
    print(f'Preprocessing data')

cli = click.CommandCollection(sources=[
    preprocess_cli
])

if __name__ == '__main__':
    cli()
