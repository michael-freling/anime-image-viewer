from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SuggestRequest(_message.Message):
    __slots__ = ("image_urls",)
    IMAGE_URLS_FIELD_NUMBER: _ClassVar[int]
    image_urls: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, image_urls: _Optional[_Iterable[str]] = ...) -> None: ...

class Suggestion(_message.Message):
    __slots__ = ("image_url", "scores", "sorted_score_indices")
    IMAGE_URL_FIELD_NUMBER: _ClassVar[int]
    SCORES_FIELD_NUMBER: _ClassVar[int]
    SORTED_SCORE_INDICES_FIELD_NUMBER: _ClassVar[int]
    image_url: str
    scores: _containers.RepeatedScalarFieldContainer[float]
    sorted_score_indices: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, image_url: _Optional[str] = ..., scores: _Optional[_Iterable[float]] = ..., sorted_score_indices: _Optional[_Iterable[int]] = ...) -> None: ...

class SuggestResponse(_message.Message):
    __slots__ = ("suggestions", "all_tags")
    class AllTagsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: int
        value: str
        def __init__(self, key: _Optional[int] = ..., value: _Optional[str] = ...) -> None: ...
    SUGGESTIONS_FIELD_NUMBER: _ClassVar[int]
    ALL_TAGS_FIELD_NUMBER: _ClassVar[int]
    suggestions: _containers.RepeatedCompositeFieldContainer[Suggestion]
    all_tags: _containers.ScalarMap[int, str]
    def __init__(self, suggestions: _Optional[_Iterable[_Union[Suggestion, _Mapping]]] = ..., all_tags: _Optional[_Mapping[int, str]] = ...) -> None: ...
