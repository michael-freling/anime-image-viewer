if __name__ == '__main__':

    import grpc
    import sys
    import tag_suggestion.v1.service_pb2 as suggestion_pb2
    import tag_suggestion.v1.service_pb2_grpc as suggestion_pb2_grpc

    with grpc.insecure_channel('localhost:50051') as channel:
        stub = suggestion_pb2_grpc.TagSuggestionServiceStub(channel)

        args = sys.argv[1:]
        print(args)

        response = stub.Suggest(suggestion_pb2.SuggestRequest(image_urls=args))
        print(response)
