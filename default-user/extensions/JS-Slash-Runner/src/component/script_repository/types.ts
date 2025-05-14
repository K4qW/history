import { uuidv4 } from '@sillytavern/scripts/utils';

export class Script {
  id: string;
  name: string;
  content: string;
  info: string;
  buttons: { name: string; visible: boolean }[];
  enabled: boolean;

  constructor(data?: Partial<Script>) {
    this.id = data?.id && data.id.trim() !== '' ? data.id : uuidv4();
    this.name = data?.name || '';
    this.content = data?.content || '';
    this.info = data?.info || '';
    this.enabled = data?.enabled || false;
    this.buttons = data?.buttons || [];
  }
}

export enum ScriptType {
  GLOBAL = 'global',
  CHARACTER = 'character',
}

export const defaultScriptSettings = {
  global_script_enabled: true,
  scriptsRepository: [] as Script[],
  characters_with_scripts: [] as string[],
};

export interface IFrameElement extends HTMLIFrameElement {
  cleanup: () => void;
  [prop: string]: any;
}
