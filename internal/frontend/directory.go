package frontend

type Directory struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`

	// legacy fields: May not necessary
	ParentID uint `json:"parentId"`
}
