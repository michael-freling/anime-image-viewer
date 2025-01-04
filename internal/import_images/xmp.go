package import_images

import (
	"encoding/xml"
	"fmt"
	"io"
	"os"

	"github.com/michael-freling/anime-image-viewer/internal/db"
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
	dbClient *db.Client
}

// This is not concurrent safe. Initialize only inside a method
func newXMPReader(dbClient *db.Client) *XMPReader {
	return &XMPReader{
		dbClient: dbClient,
	}
}

func (reader *XMPReader) read(filePath string) (*XMP, error) {
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
