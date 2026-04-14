import { useImportProgressStore } from "../../src/stores/import-progress-store";

function resetStore() {
  useImportProgressStore.setState({ imports: new Map() });
}

describe("import-progress-store", () => {
  beforeEach(resetStore);

  test("start creates a fresh entry with completed=0", () => {
    useImportProgressStore.getState().start("job-1", "Naruto · Season 1", 120);

    const entry = useImportProgressStore.getState().imports.get("job-1");
    expect(entry).toBeDefined();
    expect(entry?.total).toBe(120);
    expect(entry?.completed).toBe(0);
    expect(entry?.label).toBe("Naruto · Season 1");
    expect(entry?.done).toBe(false);
  });

  test("update patches fields without touching the label", () => {
    const { start, update } = useImportProgressStore.getState();
    start("job-1", "Label", 10);
    update("job-1", { completed: 5, failed: 1 });

    const entry = useImportProgressStore.getState().imports.get("job-1");
    expect(entry?.completed).toBe(5);
    expect(entry?.failed).toBe(1);
    expect(entry?.label).toBe("Label");
  });

  test("update is a no-op for unknown ids", () => {
    useImportProgressStore.getState().update("ghost", { completed: 5 });
    expect(useImportProgressStore.getState().imports.size).toBe(0);
  });

  test("finish marks done=true and completes=total", () => {
    const { start, update, finish } = useImportProgressStore.getState();
    start("job-1", "Label", 20);
    update("job-1", { completed: 15 });
    finish("job-1");

    const entry = useImportProgressStore.getState().imports.get("job-1");
    expect(entry?.done).toBe(true);
    expect(entry?.completed).toBe(20);
  });

  test("finish is a no-op for unknown ids", () => {
    useImportProgressStore.getState().finish("ghost");
    expect(useImportProgressStore.getState().imports.size).toBe(0);
  });

  test("dismiss removes the entry; GCs a done job", () => {
    const { start, finish, dismiss } = useImportProgressStore.getState();
    start("job-1", "Label", 1);
    finish("job-1");
    dismiss("job-1");

    expect(useImportProgressStore.getState().imports.has("job-1")).toBe(false);
  });

  test("multiple imports are tracked independently", () => {
    const { start, update, finish } = useImportProgressStore.getState();
    start("a", "A", 10);
    start("b", "B", 20);

    update("a", { completed: 3 });
    finish("b");

    const state = useImportProgressStore.getState();
    expect(state.imports.get("a")?.completed).toBe(3);
    expect(state.imports.get("a")?.done).toBe(false);
    expect(state.imports.get("b")?.completed).toBe(20);
    expect(state.imports.get("b")?.done).toBe(true);
  });

  test("each mutation returns a new Map (immutability for selectors)", () => {
    useImportProgressStore.getState().start("a", "A", 1);
    const before = useImportProgressStore.getState().imports;

    useImportProgressStore.getState().update("a", { completed: 1 });
    const after = useImportProgressStore.getState().imports;

    expect(after).not.toBe(before);
  });
});
