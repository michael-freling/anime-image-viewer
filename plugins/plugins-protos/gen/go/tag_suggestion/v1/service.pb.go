// Code generated by protoc-gen-go. DO NOT EDIT.
// versions:
// 	protoc-gen-go v1.36.0
// 	protoc        (unknown)
// source: tag_suggestion/v1/service.proto

package tag_suggestionv1

import (
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	reflect "reflect"
	sync "sync"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

type SuggestRequest struct {
	state         protoimpl.MessageState `protogen:"open.v1"`
	ImageUrls     []string               `protobuf:"bytes,1,rep,name=image_urls,json=imageUrls,proto3" json:"image_urls,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SuggestRequest) Reset() {
	*x = SuggestRequest{}
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[0]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SuggestRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SuggestRequest) ProtoMessage() {}

func (x *SuggestRequest) ProtoReflect() protoreflect.Message {
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[0]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SuggestRequest.ProtoReflect.Descriptor instead.
func (*SuggestRequest) Descriptor() ([]byte, []int) {
	return file_tag_suggestion_v1_service_proto_rawDescGZIP(), []int{0}
}

func (x *SuggestRequest) GetImageUrls() []string {
	if x != nil {
		return x.ImageUrls
	}
	return nil
}

type Suggestion struct {
	state    protoimpl.MessageState `protogen:"open.v1"`
	ImageUrl string                 `protobuf:"bytes,1,opt,name=image_url,json=imageUrl,proto3" json:"image_url,omitempty"`
	// The score of the suggestion. Higher scores are better.
	// The index is matching with a tag id
	Scores []float64 `protobuf:"fixed64,2,rep,packed,name=scores,proto3" json:"scores,omitempty"`
	// The indices of the scores sorted in descending order.
	// The index is matching with a tag id
	SortedScoreIndices []int64 `protobuf:"varint,3,rep,packed,name=sorted_score_indices,json=sortedScoreIndices,proto3" json:"sorted_score_indices,omitempty"`
	unknownFields      protoimpl.UnknownFields
	sizeCache          protoimpl.SizeCache
}

func (x *Suggestion) Reset() {
	*x = Suggestion{}
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[1]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *Suggestion) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*Suggestion) ProtoMessage() {}

func (x *Suggestion) ProtoReflect() protoreflect.Message {
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[1]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use Suggestion.ProtoReflect.Descriptor instead.
func (*Suggestion) Descriptor() ([]byte, []int) {
	return file_tag_suggestion_v1_service_proto_rawDescGZIP(), []int{1}
}

func (x *Suggestion) GetImageUrl() string {
	if x != nil {
		return x.ImageUrl
	}
	return ""
}

func (x *Suggestion) GetScores() []float64 {
	if x != nil {
		return x.Scores
	}
	return nil
}

func (x *Suggestion) GetSortedScoreIndices() []int64 {
	if x != nil {
		return x.SortedScoreIndices
	}
	return nil
}

type SuggestResponse struct {
	state       protoimpl.MessageState `protogen:"open.v1"`
	Suggestions []*Suggestion          `protobuf:"bytes,1,rep,name=suggestions,proto3" json:"suggestions,omitempty"`
	// The all tags that can be potentially suggested
	// The key is the tag id
	AllTags       map[int64]string `protobuf:"bytes,2,rep,name=all_tags,json=allTags,proto3" json:"all_tags,omitempty" protobuf_key:"varint,1,opt,name=key" protobuf_val:"bytes,2,opt,name=value"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SuggestResponse) Reset() {
	*x = SuggestResponse{}
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[2]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SuggestResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SuggestResponse) ProtoMessage() {}

func (x *SuggestResponse) ProtoReflect() protoreflect.Message {
	mi := &file_tag_suggestion_v1_service_proto_msgTypes[2]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SuggestResponse.ProtoReflect.Descriptor instead.
func (*SuggestResponse) Descriptor() ([]byte, []int) {
	return file_tag_suggestion_v1_service_proto_rawDescGZIP(), []int{2}
}

func (x *SuggestResponse) GetSuggestions() []*Suggestion {
	if x != nil {
		return x.Suggestions
	}
	return nil
}

func (x *SuggestResponse) GetAllTags() map[int64]string {
	if x != nil {
		return x.AllTags
	}
	return nil
}

var File_tag_suggestion_v1_service_proto protoreflect.FileDescriptor

var file_tag_suggestion_v1_service_proto_rawDesc = []byte{
	0x0a, 0x1f, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e,
	0x2f, 0x76, 0x31, 0x2f, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74,
	0x6f, 0x12, 0x11, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f,
	0x6e, 0x2e, 0x76, 0x31, 0x22, 0x2f, 0x0a, 0x0e, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x52,
	0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x12, 0x1d, 0x0a, 0x0a, 0x69, 0x6d, 0x61, 0x67, 0x65, 0x5f,
	0x75, 0x72, 0x6c, 0x73, 0x18, 0x01, 0x20, 0x03, 0x28, 0x09, 0x52, 0x09, 0x69, 0x6d, 0x61, 0x67,
	0x65, 0x55, 0x72, 0x6c, 0x73, 0x22, 0x73, 0x0a, 0x0a, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74,
	0x69, 0x6f, 0x6e, 0x12, 0x1b, 0x0a, 0x09, 0x69, 0x6d, 0x61, 0x67, 0x65, 0x5f, 0x75, 0x72, 0x6c,
	0x18, 0x01, 0x20, 0x01, 0x28, 0x09, 0x52, 0x08, 0x69, 0x6d, 0x61, 0x67, 0x65, 0x55, 0x72, 0x6c,
	0x12, 0x16, 0x0a, 0x06, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x73, 0x18, 0x02, 0x20, 0x03, 0x28, 0x01,
	0x52, 0x06, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x73, 0x12, 0x30, 0x0a, 0x14, 0x73, 0x6f, 0x72, 0x74,
	0x65, 0x64, 0x5f, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x5f, 0x69, 0x6e, 0x64, 0x69, 0x63, 0x65, 0x73,
	0x18, 0x03, 0x20, 0x03, 0x28, 0x03, 0x52, 0x12, 0x73, 0x6f, 0x72, 0x74, 0x65, 0x64, 0x53, 0x63,
	0x6f, 0x72, 0x65, 0x49, 0x6e, 0x64, 0x69, 0x63, 0x65, 0x73, 0x22, 0xda, 0x01, 0x0a, 0x0f, 0x53,
	0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x12, 0x3f,
	0x0a, 0x0b, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x18, 0x01, 0x20,
	0x03, 0x28, 0x0b, 0x32, 0x1d, 0x2e, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73,
	0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x2e, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69,
	0x6f, 0x6e, 0x52, 0x0b, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x12,
	0x4a, 0x0a, 0x08, 0x61, 0x6c, 0x6c, 0x5f, 0x74, 0x61, 0x67, 0x73, 0x18, 0x02, 0x20, 0x03, 0x28,
	0x0b, 0x32, 0x2f, 0x2e, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69,
	0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x2e, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x52, 0x65, 0x73,
	0x70, 0x6f, 0x6e, 0x73, 0x65, 0x2e, 0x41, 0x6c, 0x6c, 0x54, 0x61, 0x67, 0x73, 0x45, 0x6e, 0x74,
	0x72, 0x79, 0x52, 0x07, 0x61, 0x6c, 0x6c, 0x54, 0x61, 0x67, 0x73, 0x1a, 0x3a, 0x0a, 0x0c, 0x41,
	0x6c, 0x6c, 0x54, 0x61, 0x67, 0x73, 0x45, 0x6e, 0x74, 0x72, 0x79, 0x12, 0x10, 0x0a, 0x03, 0x6b,
	0x65, 0x79, 0x18, 0x01, 0x20, 0x01, 0x28, 0x03, 0x52, 0x03, 0x6b, 0x65, 0x79, 0x12, 0x14, 0x0a,
	0x05, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x18, 0x02, 0x20, 0x01, 0x28, 0x09, 0x52, 0x05, 0x76, 0x61,
	0x6c, 0x75, 0x65, 0x3a, 0x02, 0x38, 0x01, 0x32, 0x68, 0x0a, 0x14, 0x54, 0x61, 0x67, 0x53, 0x75,
	0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x53, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x12,
	0x50, 0x0a, 0x07, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x12, 0x21, 0x2e, 0x74, 0x61, 0x67,
	0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x2e, 0x53,
	0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x22, 0x2e,
	0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76,
	0x31, 0x2e, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73,
	0x65, 0x42, 0xf6, 0x01, 0x0a, 0x15, 0x63, 0x6f, 0x6d, 0x2e, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75,
	0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x42, 0x0c, 0x53, 0x65, 0x72,
	0x76, 0x69, 0x63, 0x65, 0x50, 0x72, 0x6f, 0x74, 0x6f, 0x50, 0x01, 0x5a, 0x6e, 0x67, 0x69, 0x74,
	0x68, 0x75, 0x62, 0x2e, 0x63, 0x6f, 0x6d, 0x2f, 0x6d, 0x69, 0x63, 0x68, 0x61, 0x65, 0x6c, 0x2d,
	0x66, 0x72, 0x65, 0x6c, 0x69, 0x6e, 0x67, 0x2f, 0x61, 0x6e, 0x69, 0x6d, 0x65, 0x2d, 0x69, 0x6d,
	0x61, 0x67, 0x65, 0x2d, 0x76, 0x69, 0x65, 0x77, 0x65, 0x72, 0x2f, 0x70, 0x6c, 0x75, 0x67, 0x69,
	0x6e, 0x73, 0x2f, 0x70, 0x6c, 0x75, 0x67, 0x69, 0x6e, 0x73, 0x2d, 0x70, 0x72, 0x6f, 0x74, 0x6f,
	0x73, 0x2f, 0x67, 0x65, 0x6e, 0x2f, 0x67, 0x6f, 0x2f, 0x74, 0x61, 0x67, 0x5f, 0x73, 0x75, 0x67,
	0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x2f, 0x76, 0x31, 0x3b, 0x74, 0x61, 0x67, 0x5f, 0x73,
	0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x76, 0x31, 0xa2, 0x02, 0x03, 0x54, 0x58,
	0x58, 0xaa, 0x02, 0x10, 0x54, 0x61, 0x67, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f,
	0x6e, 0x2e, 0x56, 0x31, 0xca, 0x02, 0x10, 0x54, 0x61, 0x67, 0x53, 0x75, 0x67, 0x67, 0x65, 0x73,
	0x74, 0x69, 0x6f, 0x6e, 0x5c, 0x56, 0x31, 0xe2, 0x02, 0x1c, 0x54, 0x61, 0x67, 0x53, 0x75, 0x67,
	0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x5c, 0x56, 0x31, 0x5c, 0x47, 0x50, 0x42, 0x4d, 0x65,
	0x74, 0x61, 0x64, 0x61, 0x74, 0x61, 0xea, 0x02, 0x11, 0x54, 0x61, 0x67, 0x53, 0x75, 0x67, 0x67,
	0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x3a, 0x3a, 0x56, 0x31, 0x62, 0x06, 0x70, 0x72, 0x6f, 0x74,
	0x6f, 0x33,
}

var (
	file_tag_suggestion_v1_service_proto_rawDescOnce sync.Once
	file_tag_suggestion_v1_service_proto_rawDescData = file_tag_suggestion_v1_service_proto_rawDesc
)

func file_tag_suggestion_v1_service_proto_rawDescGZIP() []byte {
	file_tag_suggestion_v1_service_proto_rawDescOnce.Do(func() {
		file_tag_suggestion_v1_service_proto_rawDescData = protoimpl.X.CompressGZIP(file_tag_suggestion_v1_service_proto_rawDescData)
	})
	return file_tag_suggestion_v1_service_proto_rawDescData
}

var file_tag_suggestion_v1_service_proto_msgTypes = make([]protoimpl.MessageInfo, 4)
var file_tag_suggestion_v1_service_proto_goTypes = []any{
	(*SuggestRequest)(nil),  // 0: tag_suggestion.v1.SuggestRequest
	(*Suggestion)(nil),      // 1: tag_suggestion.v1.Suggestion
	(*SuggestResponse)(nil), // 2: tag_suggestion.v1.SuggestResponse
	nil,                     // 3: tag_suggestion.v1.SuggestResponse.AllTagsEntry
}
var file_tag_suggestion_v1_service_proto_depIdxs = []int32{
	1, // 0: tag_suggestion.v1.SuggestResponse.suggestions:type_name -> tag_suggestion.v1.Suggestion
	3, // 1: tag_suggestion.v1.SuggestResponse.all_tags:type_name -> tag_suggestion.v1.SuggestResponse.AllTagsEntry
	0, // 2: tag_suggestion.v1.TagSuggestionService.Suggest:input_type -> tag_suggestion.v1.SuggestRequest
	2, // 3: tag_suggestion.v1.TagSuggestionService.Suggest:output_type -> tag_suggestion.v1.SuggestResponse
	3, // [3:4] is the sub-list for method output_type
	2, // [2:3] is the sub-list for method input_type
	2, // [2:2] is the sub-list for extension type_name
	2, // [2:2] is the sub-list for extension extendee
	0, // [0:2] is the sub-list for field type_name
}

func init() { file_tag_suggestion_v1_service_proto_init() }
func file_tag_suggestion_v1_service_proto_init() {
	if File_tag_suggestion_v1_service_proto != nil {
		return
	}
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: file_tag_suggestion_v1_service_proto_rawDesc,
			NumEnums:      0,
			NumMessages:   4,
			NumExtensions: 0,
			NumServices:   1,
		},
		GoTypes:           file_tag_suggestion_v1_service_proto_goTypes,
		DependencyIndexes: file_tag_suggestion_v1_service_proto_depIdxs,
		MessageInfos:      file_tag_suggestion_v1_service_proto_msgTypes,
	}.Build()
	File_tag_suggestion_v1_service_proto = out.File
	file_tag_suggestion_v1_service_proto_rawDesc = nil
	file_tag_suggestion_v1_service_proto_goTypes = nil
	file_tag_suggestion_v1_service_proto_depIdxs = nil
}
