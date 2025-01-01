package import_images

import (
	"encoding/xml"
	"testing"

	"github.com/michael-freling/anime-image-viewer/internal/image"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestXmpSidecarReader_read(t *testing.T) {
	tester := newTester(t)

	xmpName := xml.Name{
		Space: "adobe:ns:meta/",
		Local: "xmpmeta",
	}
	testCases := []struct {
		name      string
		filePath  string
		want      *XMP
		wantError bool
	}{
		{
			name:     "single tag in a XMP file",
			filePath: string(image.TestImageFileJpeg) + ".xmp",
			want: &XMP{
				XMLName: xmpName,
				RDF: RDF{
					TagsList: []string{
						"Test 1/Test 10/Test 100",
					},
				},
			},
		},
		{
			name:     "multiple tags in a XMP file",
			filePath: string(image.TestImageFilePng) + ".xmp",
			want: &XMP{
				XMLName: xmpName,
				RDF: RDF{
					TagsList: []string{
						"Test 2",
						"Test 2/Test 20",
					},
				},
			},
		},
		{
			name:      "a file doesn't have a xmp file",
			filePath:  string(image.TestImageFileNonImage) + ".xmp",
			wantError: true,
		},
		{
			name:      "a xmp file has a different format",
			filePath:  "xmp_invalid_format.xml.xmp",
			wantError: true,
		},
		{
			name:      "a xmp file has a different format",
			filePath:  "xmp_invalid_format.xml.xmp",
			wantError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			reader := &XMPReader{}
			got, gotErr := reader.read(
				tester.getTestFilePath(tc.filePath),
			)
			if tc.wantError {
				require.Error(t, gotErr)
				return
			}
			require.NoError(t, gotErr)
			assert.Equal(t, tc.want, got)
		})
	}
}
