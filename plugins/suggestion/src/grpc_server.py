from concurrent import futures
import grpc
from inference import Inference
import tag_suggestion.v1.service_pb2 as suggestion_pb2
import tag_suggestion.v1.service_pb2_grpc as suggestion_pb2_grpc


class TagSuggestionService(suggestion_pb2_grpc.TagSuggestionServiceServicer):
    def __init__(self, model_path: str):
        self.inference = Inference(model_path)

    def Suggest(self, request: suggestion_pb2.SuggestRequest, context) -> suggestion_pb2.SuggestResponse:
        prediction_result = self.inference.predict(request.image_urls)
        suggestions = []
        for index in range(len(request.image_urls)):
            image_url = request.image_urls[index]
            scores = prediction_result['scores'][index]
            sorted_indices = prediction_result['sorted_indices'][index]

            suggestions.append(suggestion_pb2.Suggestion(
                image_url=image_url,
                scores=scores,
                sorted_score_indices=sorted_indices,
            ))
        response = suggestion_pb2.SuggestResponse(
            suggestions=suggestions,
            all_tags=prediction_result['tags'],
        )
        return response


def start_grpc_server(model_path: str):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    service = TagSuggestionService(model_path)
    suggestion_pb2_grpc.add_TagSuggestionServiceServicer_to_server(
        service, server)
    port = 50051
    server.add_insecure_port(f'[::]:{port}')
    print(f'Starting server. Listening on port {port}.')
    server.start()
    server.wait_for_termination()
