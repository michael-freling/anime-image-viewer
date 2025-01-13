import datasets
from regex import F


class DatasetImageExtractor:
    def show_images(self, data_dir: str):
        ds = datasets.load_from_disk(data_dir)
        for split in ds:
            for i in range(len(ds[split])):
                image = ds[split]['image'][i]
                image.save(F"debug/{split}_{i}.png")
