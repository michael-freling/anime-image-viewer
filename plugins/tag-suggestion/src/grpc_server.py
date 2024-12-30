import multiprocessing as mp
import json
import logging
from typing import Any, Callable
from grpc_interceptor import ServerInterceptor
from concurrent import futures
import grpc
from inference import Inference
import tag_suggestion.v1.service_pb2 as suggestion_pb2
import tag_suggestion.v1.service_pb2_grpc as suggestion_pb2_grpc


class TagSuggestionService(suggestion_pb2_grpc.TagSuggestionServiceServicer):
    def __init__(self, model_path: str, resize_image_width: int):
        self.inference = Inference(model_path, resize_image_width)

    def Suggest(self, request: suggestion_pb2.SuggestRequest, context) -> suggestion_pb2.SuggestResponse:
        prediction_result = self.inference.predict(map(
            # Replace Windows path with WSL path
            lambda x: x.replace(
                "C:\\", "/mnt/c/"
            )
            .replace("\\", "/"),
            request.image_urls
        ))
        suggestions = []
        for index in range(len(request.image_urls)):
            image_url = request.image_urls[index]
            scores = prediction_result['scores'][index]
            sorted_indices = prediction_result['sorted_indices'][index]

            suggestion_scores = [suggestion_pb2.SuggestionScore(
                tag_id=sorted_indices[i],
                score=scores[sorted_indices[i]],
            ) for i in range(len(sorted_indices))]
            suggestions.append(suggestion_pb2.Suggestion(
                image_url=image_url,
                scores=suggestion_scores,
            ))
        response = suggestion_pb2.SuggestResponse(
            suggestions=suggestions,
            all_tags={
                id: suggestion_pb2.Tag(id=id, name=name)
                for id, name in prediction_result['tags'].items()
            },
        )
        return response


class ErrorLogInterceptor(ServerInterceptor):
    def intercept(self, method: Callable, request: Any, context: grpc.ServicerContext, method_name: str):
        try:
            return method(request, context)
        except Exception as e:
            logRecord = json.dumps({
                'message': 'Error occurred during method execution',
                'method_name': method_name,
            })
            logging.exception(logRecord)
            raise


def start_grpc_server(model_path: str, resize_image_width: int):
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=mp.cpu_count() * 2),
        interceptors=[ErrorLogInterceptor()],
    )
    service = TagSuggestionService(model_path, resize_image_width)
    suggestion_pb2_grpc.add_TagSuggestionServiceServicer_to_server(
        service, server)
    port = 50051
    server.add_insecure_port(f'[::]:{port}')
    print(f'Starting server. Listening on port {port}.')
    server.start()
    server.wait_for_termination()
