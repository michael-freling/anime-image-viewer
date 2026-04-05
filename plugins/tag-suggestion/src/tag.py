import json


class Tag:
    id: int
    name: str

    def __init__(self, id: int, name: str, **kwargs):
        self.id = id
        self.name = name

    def to_dict(self) -> dict[str, any]:
        return {
            'id': self.id,
            'name': self.name,
        }


class TagReader:
    def __init__(self, json_file_path: str):
        self.json_file_path = json_file_path

    def read_flatten_tags(self):
        with open(self.json_file_path, 'r') as f:
            jsonLine = json.loads(f.read())

        tags = []
        for value in jsonLine:
            tags.append(Tag(**value))

        # Convert to list indexed by tag ID
        if len(tags) == 0:
            return ['']

        max_id = max(tag.id for tag in tags)
        result = ['' for _ in range(max_id + 1)]
        for tag in tags:
            result[tag.id] = tag.name

        return result
