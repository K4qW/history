declare global {
  const builtin: {
    saveSettings: () => Promise<void>;
    reloadEditor: (file: string, load_if_not_selected?: boolean) => void;
    reloadEditorDebounced: (file: string, load_if_not_selected?: boolean) => void;
  };
}
