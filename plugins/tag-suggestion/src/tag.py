import json


class Tag:
    id: int
    name: str
    parent_id: int
    full_name: str
    children: list['Tag']

    def __init__(self, id: int, name: str, full_name: str, parentId: int = 0, children: list['Tag'] = []):
        self.id = id
        self.name = name
        self.parent_id = parentId
        self.full_name = full_name
        self.children = []
        for child in children:
            self.children.append(Tag(**child))

    def to_dict(self) -> dict[str, any]:
        return {
            'id': self.id,
            'name': self.name,
            'full_name': self.full_name,
            'children': [child.to_dict() for child in self.children]
        }

    def flatten(self) -> dict[int, dict[str, any]]:
        result = {}
        result[self.id] = self.to_dict()
        for child in self.children:
            result.update(child.flatten())
        return result


class TagReader:
    def __init__(self, json_file_path: str):
        self.json_file_path = json_file_path

    def read_flatten_tags(self):
        with open(self.json_file_path, 'r') as f:
            jsonLine = json.loads(f.read())

        tags = []
        for value in jsonLine:
            tags.append(Tag(**value))

        def flatten(tags: list[Tag]):
            result = {}
            for tag in tags:
                result.update(tag.flatten())
            return result

        dict = flatten(tags)
        # Convert dict to list
        result = ['' for _ in range(len(dict) + 1)]
        for key, value in dict.items():
            result[key] = value['name']

        return result
