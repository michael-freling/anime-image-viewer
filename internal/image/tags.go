package image

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"sort"

	"github.com/michael-freling/anime-image-viewer/internal/db"
	"github.com/michael-freling/anime-image-viewer/internal/xslices"
	"golang.org/x/sync/errgroup"
)

type TagService struct {
	logger           *slog.Logger
	dbClient         *db.Client
	directoryService *DirectoryService
}

func NewTagService(
	logger *slog.Logger,
	dbClient *db.Client,
	directoryService *DirectoryService,
) *TagService {
	return &TagService{
		logger:           logger,
		dbClient:         dbClient,
		directoryService: directoryService,
	}
}

func (service *TagService) CreateTopTag(name string) (Tag, error) {
	tag := db.Tag{
		Name: name,
	}
	err := db.Create(service.dbClient, &tag)
	if err != nil {
		return Tag{}, fmt.Errorf("db.Create: %w", err)
	}

	return Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

type TagInput struct {
	Name     string
	ParentID uint
}

func (service *TagService) Create(input TagInput) (Tag, error) {
	parentTag, err := db.FindByValue(service.dbClient, &db.Tag{
		ID: input.ParentID,
	})
	if err != nil {
		return Tag{}, fmt.Errorf("db.FindByValue: %w", err)
	}

	tag := db.Tag{
		Name:     input.Name,
		ParentID: input.ParentID,
	}
	if parentTag.Type == db.TagTypeSeason {
		tag.Type = db.TagTypeSeason
	}
	if parentTag.Type == db.TagTypeSeries && parentTag.ParentID == 0 {
		// series tags are only the first level, for example
		// Series > Attack on Titan, but not
		// Series > Attack on Titan > Season 1
		tag.Type = db.TagTypeSeries
	}

	err = db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		_, err := ormClient.FindByValue(&db.Tag{
			ID: input.ParentID,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		if err := ormClient.Create(&tag); err != nil {
			return fmt.Errorf("ormClient.Create: %w", err)
		}

		// create some tags automatically
		if parentTag.Type == db.TagTypeSeries && parentTag.ParentID == 0 {
			seriesTags := []db.Tag{
				{Name: "Characters", ParentID: tag.ID},
				{Name: "Seasons", ParentID: tag.ID},
			}
			if err := ormClient.BatchCreate(seriesTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
			if err := ormClient.Create(&db.Tag{
				Name:     "Season 1",
				Type:     db.TagTypeSeason,
				ParentID: seriesTags[1].ID,
			}); err != nil {
				return fmt.Errorf("ormClient.Create: %w", err)
			}
		}
		if parentTag.Type == db.TagTypeSeason && parentTag.ParentID == 0 {
			err = ormClient.BatchCreate([]db.Tag{
				{Name: "Winter", ParentID: tag.ID},
				{Name: "Spring", ParentID: tag.ID},
				{Name: "Summer", ParentID: tag.ID},
				{Name: "Fall", ParentID: tag.ID},
			})
			if err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}

		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   tag.ID,
		Name: tag.Name,
	}, nil
}

func (service *TagService) UpdateName(id uint, name string) (Tag, error) {
	var newTag db.Tag
	err := db.NewTransaction(service.dbClient, func(ormClient *db.ORMClient[db.Tag]) error {
		var err error
		newTag, err = ormClient.FindByValue(&db.Tag{
			ID: id,
		})
		if err != nil {
			return fmt.Errorf("ormClient.FindByValue: %w", err)
		}

		newTag.Name = name
		if err := ormClient.Update(&newTag); err != nil {
			return fmt.Errorf("ormClient.Update: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tag{}, err
	}

	return Tag{
		ID:   newTag.ID,
		Name: newTag.Name,
	}, nil
}

type Tag struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	FullName string `json:"full_name,omitempty"`
	parent   *Tag   `json:"-"`
	tagType  db.TagType
	Children []*Tag `json:"children,omitempty"`
}

func (tag Tag) fullName() string {
	if tag.parent == nil {
		return tag.Name
	}
	return fmt.Sprintf("%s > %s", tag.parent.fullName(), tag.Name)
}

func (tag Tag) findChildByID(ID uint) Tag {
	if tag.ID == ID {
		return tag
	}
	for i := range tag.Children {
		if child := tag.Children[i].findChildByID(ID); child.ID != 0 {
			return child
		}
	}
	return Tag{}
}

func (tag Tag) findDescendants() []Tag {
	descendants := make([]Tag, 0)
	for i := range tag.Children {
		descendants = append(descendants, *tag.Children[i])
		descendants = append(descendants, tag.Children[i].findDescendants()...)
	}
	return descendants
}

func convertTagsToMap(tags []Tag) map[uint]Tag {
	result := make(map[uint]Tag)
	for _, tag := range tags {
		result[tag.ID] = tag
		children := convertTagsToMap(xslices.Map(tag.Children, func(t *Tag) Tag {
			return *t
		}))
		for id, child := range children {
			result[id] = child
		}
		tag.Children = nil
	}
	return result
}

func getMaxTagID(tags []Tag) uint {
	maxID := uint(0)
	for _, tag := range tags {
		if tag.ID > maxID {
			maxID = tag.ID
		}

		children := tag.findDescendants()
		if len(children) == 0 {
			continue
		}
		childMaxID := slices.Max(xslices.Map(children, func(tag Tag) uint {
			return tag.ID
		}))
		if childMaxID > maxID {
			maxID = childMaxID
		}
	}
	return maxID
}

func (service *TagService) GetAll() ([]Tag, error) {
	tags, err := service.readAllTags()
	if err != nil {
		return nil, fmt.Errorf("readAllTags: %w", err)
	}

	result := make([]Tag, 0)
	seriesTags := make([]Tag, 0)
	seasonTags := make([]Tag, 0)
	otherTags := make([]Tag, 0)
	for _, tag := range tags {
		switch tag.tagType {
		case db.TagTypeSeries:
			seriesTags = append(seriesTags, tag)
		case db.TagTypeSeason:
			seasonTags = append(seasonTags, tag)
		default:
			otherTags = append(otherTags, tag)
		}
	}
	result = append(result, seriesTags...)
	result = append(result, seasonTags...)
	result = append(result, otherTags...)
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

func (service *TagService) readAllTags() ([]Tag, error) {
	allTags, err := db.GetAll[db.Tag](service.dbClient)
	if err != nil {
		return nil, fmt.Errorf("ormClient.GetAll: %w", err)
	}
	if len(allTags) == 0 {
		return nil, nil
	}

	childMap := make(map[uint][]Tag)
	for _, t := range allTags {
		if _, ok := childMap[t.ParentID]; ok {
			continue
		}
		childMap[t.ParentID] = make([]Tag, 0)
	}
	tagMap := make(map[uint]Tag)
	for _, t := range allTags {
		tagMap[t.ID] = Tag{
			ID:      t.ID,
			Name:    t.Name,
			tagType: t.Type,
		}

		childMap[t.ParentID] = append(childMap[t.ParentID], tagMap[t.ID])
	}

	return xslices.Map(buildTagTree(tagMap, childMap, 0, nil).Children, func(t *Tag) Tag {
		return *t
	}), nil
}

func buildTagTree(tagMap map[uint]Tag, childMap map[uint][]Tag, parentID uint, parent *Tag) *Tag {
	t := tagMap[parentID]
	if parent != nil && parent.ID != 0 {
		t.parent = parent
	}
	t.FullName = t.fullName()

	if _, ok := childMap[parentID]; !ok {
		return &t
	}

	t.Children = make([]*Tag, len(childMap[parentID]))
	for i, child := range childMap[parentID] {
		t.Children[i] = buildTagTree(tagMap, childMap, child.ID, &t)
	}
	sort.Slice(t.Children, func(i, j int) bool {
		return t.Children[i].Name < t.Children[j].Name
	})
	return &t
}

type ReadImageFilesResponse struct {
	// tag includes descendants
	Tags       []Tag
	ImageFiles map[uint][]ImageFile
}

// returns directoryID => all files under a directory
func createDirectoryFileMaps(files []db.File, root Directory) map[uint][]db.File {
	directoryFiles := make(map[uint][]db.File)
	for _, file := range files {
		directory := root.findChildByID(file.ParentID)
		if directory.ID == 0 {
			continue
		}
		directoryFiles[file.ParentID] = append(directoryFiles[file.ParentID], file)
	}
	return directoryFiles
}

func (service *TagService) readDBTagRecursively(tagID uint) (db.FileTagList, error) {
	allTags, err := service.readAllTags()
	if err != nil {
		return nil, fmt.Errorf("service.GetAll: %w", err)
	}
	if len(allTags) == 0 {
		return nil, nil
	}

	// find child tag
	searchTagIDs := make([]uint, 0)
	for _, tagTree := range allTags {
		tag := tagTree.findChildByID(tagID)
		if tag.ID == 0 {
			continue
		}
		searchTagIDs = append(searchTagIDs, tag.ID)

		descendantTags := tag.findDescendants()
		for _, descendantTag := range descendantTags {
			searchTagIDs = append(searchTagIDs, descendantTag.ID)
		}
	}

	fileTags, err := service.dbClient.FileTag().
		FindAllByTagIDs(searchTagIDs)
	if err != nil {
		return nil, fmt.Errorf("db.FindAllByTagIDs: %w", err)
	}
	return fileTags, nil
}

func (service *TagService) ReadImageFiles(tagID uint) (ReadImageFilesResponse, error) {
	fileTags, err := service.readDBTagRecursively(tagID)
	if err != nil {
		return ReadImageFilesResponse{}, fmt.Errorf("service.readDBTagRecursively: %w", err)
	}
	if len(fileTags) == 0 {
		return ReadImageFilesResponse{}, nil
	}
	fileIDs := fileTags.ToFileIDs()

	// find ancestors of directories
	directories, err := service.directoryService.readDirectories(fileIDs)
	if err != nil && !errors.Is(err, ErrDirectoryNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("directoryService.readDirectories: %w", err)
	}
	dbParentIDs := make([]uint, len(directories))
	for _, directory := range directories {
		descendants := directory.getDescendants()
		for _, descendant := range descendants {
			dbParentIDs = append(dbParentIDs, descendant.ID)
		}
		dbParentIDs = append(dbParentIDs, directory.ID)
	}
	imageFilesUnderDirectories, err := service.dbClient.File().
		FindImageFilesByParentIDs(dbParentIDs)
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("db.FindImageFilesByParentIDs: %w", err)
	}

	// find files
	dbImageFiles, err := service.dbClient.File().
		FindImageFilesByIDs(fileIDs)
	if err != nil && !errors.Is(err, db.ErrRecordNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("db.FindImageFilesByIDs: %w", err)
	}
	for _, dbImageFile := range dbImageFiles {
		dbParentIDs = append(dbParentIDs, dbImageFile.ParentID)
	}
	parentDirectories, err := service.directoryService.readDirectories(dbParentIDs)
	if err != nil && !errors.Is(err, ErrDirectoryNotFound) {
		return ReadImageFilesResponse{}, fmt.Errorf("directoryService.readDirectories: %w", err)
	}

	// to find a tag and
	allTags, err := service.readAllTags()
	if err != nil {
		return ReadImageFilesResponse{}, fmt.Errorf("service.GetAll: %w", err)
	}

	directoryDescendants := make(map[uint][]uint)
	for _, directory := range directories {
		for id, fileIDs := range directory.toFlatIDMap() {
			directoryDescendants[id] = append(directoryDescendants[id], fileIDs...)
		}
	}

	fileTagsMap := make(map[uint][]Tag, 0)
	for tagID, fileTagMap := range fileTags.ToTagMap() {
		tags := make([]Tag, 0)
		for _, t := range allTags {
			tag := t.findChildByID(tagID)
			if tag.ID == tagID {
				tags = append(tags, tag)
				break
			}
		}

		for fileID := range fileTagMap {
			descendants := directoryDescendants[fileID]
			for _, descendantFileID := range descendants {
				fileTagsMap[descendantFileID] = append(fileTagsMap[descendantFileID], tags...)
			}

			for _, imageFile := range dbImageFiles {
				if imageFile.ID == fileID {
					fileTagsMap[fileID] = append(fileTagsMap[fileID], tags...)
					break
				}
			}
		}
	}

	resultTags := make([]Tag, 0)
	result := make(map[uint][]ImageFile, 0)
	imageFileErrors := make([]error, 0)
	fileAdded := make(map[uint]struct{})
	for _, dbfs := range [][]db.File{imageFilesUnderDirectories, dbImageFiles} {
		for _, dbImageFile := range dbfs {
			if _, ok := fileAdded[dbImageFile.ID]; ok {
				continue
			}
			fileAdded[dbImageFile.ID] = struct{}{}

			parentDirectory := parentDirectories[dbImageFile.ParentID]
			if parentDirectory.ID == 0 {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("%w: %d for an image %d", ErrDirectoryNotFound, dbImageFile.ParentID, dbImageFile.ID))
				continue
			}
			imageFile, err := service.directoryService.convertImageFile(parentDirectory, dbImageFile)
			if err != nil {
				imageFileErrors = append(imageFileErrors, fmt.Errorf("directoryService.convertImageFile: %w", err))
				continue
			}

			imageFileTags := fileTagsMap[imageFile.ID]
			for _, tag := range imageFileTags {
				if _, ok := result[tag.ID]; ok {
					continue
				}
				result[tag.ID] = make([]ImageFile, 0)
				resultTags = append(resultTags, tag)
			}
		OUTER:
			for _, tag := range imageFileTags {
				for _, resultFile := range result[tag.ID] {
					if imageFile.ID == resultFile.ID {
						continue OUTER
					}
				}
				result[tag.ID] = append(result[tag.ID], imageFile)
			}
		}
	}
	if len(imageFileErrors) > 0 {
		return ReadImageFilesResponse{}, errors.Join(imageFileErrors...)
	}

	sort.Slice(resultTags, func(i, j int) bool {
		return resultTags[i].Name < resultTags[j].Name
	})
	return ReadImageFilesResponse{
		Tags:       resultTags,
		ImageFiles: result,
	}, nil
}

type File struct {
	ID       uint
	Name     string
	ParentID uint
}

type imageTagChecker struct {
	imageFileID uint

	// tag id => bool (true if the image file has the tag)
	imageFileTags map[uint]bool

	// directory id => an ancestor
	ancestors map[uint]Directory

	// tag id => an ids of ancestors
	ancestorsTags map[uint][]uint

	allTags map[uint]Tag
}

func (checker imageTagChecker) hasDecendantTag(tagID uint) bool {
	tag, ok := checker.allTags[tagID]
	if !ok {
		return false
	}
	for _, descendant := range tag.findDescendants() {
		if _, ok := checker.imageFileTags[descendant.ID]; ok {
			return true
		}
		if _, ok := checker.ancestorsTags[descendant.ID]; ok {
			return true
		}
	}
	return false
}

func (checker imageTagChecker) hasTag(tagID uint) bool {
	if _, ok := checker.imageFileTags[tagID]; ok {
		return true
	}
	if _, ok := checker.ancestorsTags[tagID]; ok {
		return true
	}
	return false
}

func (checker imageTagChecker) getTagCounts() map[uint]bool {
	tagCounts := make(map[uint]bool)
	for tagID := range checker.imageFileTags {
		tagCounts[tagID] = true
	}
	for tagID := range checker.ancestorsTags {
		tagCounts[tagID] = true
	}
	return tagCounts
}

type batchImageTagChecker struct {
	imageTagCheckers []imageTagChecker
}

func (checker batchImageTagChecker) getTagCheckerForImageFileID(imageFileID uint) imageTagChecker {
	for _, imageTagChecker := range checker.imageTagCheckers {
		if imageTagChecker.imageFileID == imageFileID {
			return imageTagChecker
		}
	}
	return imageTagChecker{}
}

func (checker batchImageTagChecker) getTagsMapFromAncestors() map[uint][]File {
	ancestorMap := make(map[uint][]File)
	for _, imageTagChecker := range checker.imageTagCheckers {
		for tagID := range imageTagChecker.ancestorsTags {
			ancestorMap[tagID] = append(ancestorMap[tagID], File{
				ID: imageTagChecker.imageFileID,
			})
		}
	}
	if len(ancestorMap) == 0 {
		return nil
	}

	return ancestorMap
}

func (checker batchImageTagChecker) getTagCounts() map[uint]uint {
	tagCounts := make(map[uint]uint)
	for _, imageTagChecker := range checker.imageTagCheckers {
		for tagID := range imageTagChecker.getTagCounts() {
			tagCounts[tagID]++
		}
	}
	if len(tagCounts) == 0 {
		return nil
	}

	return tagCounts
}

type ReadTagsByFileIDsResponse struct {
	// AncestorMap maps tag IDs to their ancestors
	AncestorMap map[uint][]File

	// TagCounts maps tag IDs to the number of files that have the tag
	TagCounts map[uint]uint
}

func (service *TagService) createBatchTagCheckerByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (batchImageTagChecker, error) {
	allTagMap := make(map[uint]Tag, 0)

	eg, _ := errgroup.WithContext(ctx)
	eg.Go(func() error {
		allTags, err := service.readAllTags()
		if err != nil {
			return fmt.Errorf("service.readAllTags: %w", err)
		}
		allTagMap = convertTagsToMap(allTags)
		return nil
	})

	var fileTags []db.FileTag
	var fileIDToAncestors map[uint][]Directory
	eg.Go(func() error {
		var err error
		fileIDToAncestors, err = service.directoryService.readAncestors(fileIDs)
		if err != nil {
			return fmt.Errorf("directoryService.readAncestors: %w", err)
		}
		allFileIDs := make([]uint, 0)
		for _, fileID := range fileIDs {
			ancestors, ok := fileIDToAncestors[fileID]
			if ok {
				for _, ancestor := range ancestors {
					allFileIDs = append(allFileIDs, ancestor.ID)
				}
			}
			allFileIDs = append(allFileIDs, fileID)
		}

		fileTags, err = service.dbClient.FileTag().
			FindAllByFileID(allFileIDs)
		if err != nil {
			return fmt.Errorf("db.FindAllByValue: %w", err)
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return batchImageTagChecker{}, fmt.Errorf("eg.Wait: %w", err)
	}
	if len(fileTags) == 0 {
		return batchImageTagChecker{}, nil
	}

	imageTagCheckers := make([]imageTagChecker, 0)
	for _, fileID := range fileIDs {
		ancestors := fileIDToAncestors[fileID]

		ancestorMap := make(map[uint]Directory)
		for _, ancestor := range ancestors {
			ancestorMap[ancestor.ID] = ancestor
		}
		imageTagChecker := imageTagChecker{
			imageFileID: fileID,
			ancestors:   ancestorMap,
			allTags:     allTagMap,
		}

		hasImageFileTag := make(map[uint]bool, 0)
		for _, fileTag := range fileTags {
			if fileID != fileTag.FileID {
				continue
			}
			hasImageFileTag[fileTag.TagID] = true
		}
		imageTagChecker.imageFileTags = hasImageFileTag

		tagsForAncestors := make(map[uint][]uint, 0)
		for _, fileTag := range fileTags {
			for _, ancestor := range ancestors {
				if ancestor.ID != fileTag.FileID {
					continue
				}
				tagID := fileTag.TagID
				tagsForAncestors[tagID] = append(tagsForAncestors[tagID], ancestor.ID)
			}
		}
		imageTagChecker.ancestorsTags = tagsForAncestors
		imageTagCheckers = append(imageTagCheckers, imageTagChecker)
	}

	return batchImageTagChecker{
		imageTagCheckers: imageTagCheckers,
	}, nil
}

func (service *TagService) ReadTagsByFileIDs(
	ctx context.Context,
	fileIDs []uint,
) (ReadTagsByFileIDsResponse, error) {
	batchImageTagChecker, err := service.createBatchTagCheckerByFileIDs(ctx, fileIDs)
	if err != nil {
		return ReadTagsByFileIDsResponse{}, fmt.Errorf("service.createBatchTagCheckerByFileIDs: %w", err)
	}
	response := ReadTagsByFileIDsResponse{
		AncestorMap: batchImageTagChecker.getTagsMapFromAncestors(),
		TagCounts:   batchImageTagChecker.getTagCounts(),
	}
	return response, nil
}

func (service *TagService) BatchUpdateTagsForFiles(fileIDs []uint, addedTagIDs []uint, deletedTagIDs []uint) error {
	fileTagClient := service.dbClient.FileTag()
	fileTags, err := fileTagClient.FindAllByFileID(fileIDs)
	if err != nil {
		return fmt.Errorf("fileTagClient.FindAllByFileID: %w", err)
	}

	createdFileTags := make([]db.FileTag, 0)
	for _, tagID := range addedTagIDs {
		filesForTag := fileTags.ToTagMap()[tagID]
		for _, fileID := range fileIDs {
			if _, ok := filesForTag[fileID]; ok {
				continue
			}

			createdFileTags = append(createdFileTags, db.FileTag{
				TagID:  tagID,
				FileID: fileID,
			})
		}
	}
	if len(deletedTagIDs) == 0 && len(createdFileTags) == 0 {
		return nil
	}

	err = fileTagClient.WithTransaction(func(ormClient *db.FileTagClient) error {
		if len(deletedTagIDs) > 0 {
			if err := ormClient.BatchDelete(deletedTagIDs, fileIDs); err != nil {
				return fmt.Errorf("ormClient.DeleteByFileIDs: %w", err)
			}
		}
		if len(createdFileTags) > 0 {
			if err := ormClient.BatchCreate(createdFileTags); err != nil {
				return fmt.Errorf("ormClient.BatchCreate: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("db.NewTransaction: %w", err)
	}
	return nil
}
