package import_images

import (
	"encoding/xml"
	"fmt"
	"io"
	"os"
)

// trimmer-io/go-xmp doesn't support DigiKam files, so use pure XML library
type XMP struct {
	XMLName xml.Name `xml:"xmpmeta"`
	RDF     RDF      `xml:"RDF>Description"`
}

type RDF struct {
	TagsList []string `xml:"TagsList>Seq>li"`
}

type XMPReader struct {
}

func NewXMPReader() *XMPReader {
	return &XMPReader{}
}

func (r *XMPReader) read(filePath string) (*XMP, error) {
	if _, err := os.Stat(filePath); err != nil {
		return nil, fmt.Errorf("os.Stat: %w", err)
	}
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("os.Open: %w", err)
	}
	defer file.Close()

	contents, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("io.ReadAll: %w", err)
	}
	var xmp XMP
	if err := xml.Unmarshal(contents, &xmp); err != nil {
		return nil, fmt.Errorf("xml.Unmarshal: %w", err)
	}
	return &xmp, nil
}
