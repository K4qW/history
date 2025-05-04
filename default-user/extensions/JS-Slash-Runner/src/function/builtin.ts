import { reloadEditor, reloadEditorDebounced } from '@/compatibility';
import { saveSettings } from '@sillytavern/script';

export const builtin = {
  saveSettings,
  reloadEditor,
  reloadEditorDebounced,
};
