// Code generated by protoc-gen-go-grpc-mock. DO NOT EDIT.
// source: tag_suggestion/v1/service.proto

package tag_suggestionv1

import (
	context "context"
	reflect "reflect"

	gomock "go.uber.org/mock/gomock"
	grpc "google.golang.org/grpc"
)

// MockTagSuggestionServiceClient is a mock of TagSuggestionServiceClient interface.
type MockTagSuggestionServiceClient struct {
	ctrl     *gomock.Controller
	recorder *MockTagSuggestionServiceClientMockRecorder
}

// MockTagSuggestionServiceClientMockRecorder is the mock recorder for MockTagSuggestionServiceClient.
type MockTagSuggestionServiceClientMockRecorder struct {
	mock *MockTagSuggestionServiceClient
}

// NewMockTagSuggestionServiceClient creates a new mock instance.
func NewMockTagSuggestionServiceClient(ctrl *gomock.Controller) *MockTagSuggestionServiceClient {
	mock := &MockTagSuggestionServiceClient{ctrl: ctrl}
	mock.recorder = &MockTagSuggestionServiceClientMockRecorder{mock}
	return mock
}

// EXPECT returns an object that allows the caller to indicate expected use.
func (m *MockTagSuggestionServiceClient) EXPECT() *MockTagSuggestionServiceClientMockRecorder {
	return m.recorder
}

// Suggest mocks base method.
func (m *MockTagSuggestionServiceClient) Suggest(ctx context.Context, in *SuggestRequest, opts ...grpc.CallOption) (*SuggestResponse, error) {
	m.ctrl.T.Helper()
	varargs := []interface{}{ctx, in}
	for _, a := range opts {
		varargs = append(varargs, a)
	}
	ret := m.ctrl.Call(m, "Suggest", varargs...)
	ret0, _ := ret[0].(*SuggestResponse)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// Suggest indicates an expected call of Suggest.
func (mr *MockTagSuggestionServiceClientMockRecorder) Suggest(ctx, in interface{}, opts ...interface{}) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	varargs := append([]interface{}{ctx, in}, opts...)
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "Suggest", reflect.TypeOf((*MockTagSuggestionServiceClient)(nil).Suggest), varargs...)
}

// MockTagSuggestionServiceServer is a mock of TagSuggestionServiceServer interface.
type MockTagSuggestionServiceServer struct {
	ctrl     *gomock.Controller
	recorder *MockTagSuggestionServiceServerMockRecorder
}

// MockTagSuggestionServiceServerMockRecorder is the mock recorder for MockTagSuggestionServiceServer.
type MockTagSuggestionServiceServerMockRecorder struct {
	mock *MockTagSuggestionServiceServer
}

// NewMockTagSuggestionServiceServer creates a new mock instance.
func NewMockTagSuggestionServiceServer(ctrl *gomock.Controller) *MockTagSuggestionServiceServer {
	mock := &MockTagSuggestionServiceServer{ctrl: ctrl}
	mock.recorder = &MockTagSuggestionServiceServerMockRecorder{mock}
	return mock
}

// EXPECT returns an object that allows the caller to indicate expected use.
func (m *MockTagSuggestionServiceServer) EXPECT() *MockTagSuggestionServiceServerMockRecorder {
	return m.recorder
}

// Suggest mocks base method.
func (m *MockTagSuggestionServiceServer) Suggest(ctx context.Context, in *SuggestRequest) (*SuggestResponse, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "Suggest", ctx, in)
	ret0, _ := ret[0].(*SuggestResponse)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// Suggest indicates an expected call of Suggest.
func (mr *MockTagSuggestionServiceServerMockRecorder) Suggest(ctx, in interface{}) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "Suggest", reflect.TypeOf((*MockTagSuggestionServiceServer)(nil).Suggest), ctx, in)
}
