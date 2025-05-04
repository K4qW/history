import {
  purgeEmbeddedScripts,
  ScriptRepository,
  ScriptType,
  templatePath,
} from '@/component/script_repository/script_repository';

import { event_types, eventSource } from '@sillytavern/script';
import { renderExtensionTemplateAsync } from '@sillytavern/scripts/extensions';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';

const load_events = [event_types.CHAT_CHANGED] as const;
const delete_events = [event_types.CHARACTER_DELETED] as const;

let scriptRepo: ScriptRepository;

let qrBarObserver: MutationObserver | null = null;
let qrBarDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 初始化脚本库界面
 */
export async function initScriptRepository() {
  scriptRepo.handleScriptToggle(ScriptType.GLOBAL, scriptRepo.isGlobalScriptEnabled, false);

  $('#global-script-enable-toggle')
    .prop('checked', scriptRepo.isGlobalScriptEnabled)
    .on('click', (event: JQuery.ClickEvent) =>
      scriptRepo.handleScriptToggle(ScriptType.GLOBAL, event.target.checked, true),
    );
  $('#scoped-script-enable-toggle')
    .prop('checked', scriptRepo.isScopedScriptEnabled)
    .on('click', (event: JQuery.ClickEvent) =>
      scriptRepo.handleScriptToggle(ScriptType.CHARACTER, event.target.checked, true),
    );

  $('#open-global-script-editor').on('click', () => scriptRepo.openScriptEditor(ScriptType.GLOBAL, undefined));
  $('#open-scoped-script-editor').on('click', () => scriptRepo.openScriptEditor(ScriptType.CHARACTER, undefined));

  $('#scope-variable').on('click', () => scriptRepo.openVariableEditor());

  $('#import-script-file').on('change', async function () {
    let target = 'global';
    const template = $(await renderExtensionTemplateAsync(`${templatePath}`, 'script_import_target'));
    template.find('#script-import-target-global').on('input', () => (target = 'global'));
    template.find('#script-import-target-scoped').on('input', () => (target = 'scoped'));
    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
      okButton: '确认',
      cancelButton: '取消',
    });

    if (result) {
      const inputElement = this instanceof HTMLInputElement && this;
      if (inputElement && inputElement.files) {
        for (const file of inputElement.files) {
          await scriptRepo.onScriptImportFileChange(
            file,
            target === 'global' ? ScriptType.GLOBAL : ScriptType.CHARACTER,
          );
        }
        inputElement.value = '';
      }
    }
  });

  $('#import-script').on('click', function () {
    $('#import-script-file').trigger('click');
  });

  $('#default-script').on('click', () => scriptRepo.loadDefaultScriptsRepository());

  // 修复和正则同时存在white-space:nowrap时布局出错的问题
  $('#extensions_settings').css('min-width', '0');
}

/**
 * 构建脚本库
 */
export async function buildScriptRepository() {
  scriptRepo = ScriptRepository.getInstance();
  await scriptRepo.loadScriptLibrary();
  scriptRepo.initButtonContainer();
  MutationObserverQrBarCreated();
}

/**刷新脚本库 */
export async function refreshScriptRepository() {
  scriptRepo.cancelRunScriptsByType(ScriptType.CHARACTER);
  scriptRepo.removeButtonsByType(ScriptType.CHARACTER);
  await scriptRepo.checkEmbeddedScripts();
  await scriptRepo.loadScriptLibrary();
  await scriptRepo.runScriptsByType(ScriptType.CHARACTER);
  scriptRepo.addButtonsByType(ScriptType.CHARACTER);
}

/** 移除脚本库 */
export async function removeScriptRepository() {
  scriptRepo.cancelRunScriptsByType(ScriptType.GLOBAL);
  scriptRepo.cancelRunScriptsByType(ScriptType.CHARACTER);
  scriptRepo.removeButtonsByType(ScriptType.GLOBAL);
  scriptRepo.removeButtonsByType(ScriptType.CHARACTER);
  ScriptRepository.destroyInstance();
  removeMutationObserverQrBarCreated();
}

/**
 * 监听#qr--bar的元素移除
 */
function MutationObserverQrBarCreated() {
  qrBarObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        if (qrBarDebounceTimer) {
          clearTimeout(qrBarDebounceTimer);
          qrBarDebounceTimer = null;
        }

        qrBarDebounceTimer = setTimeout(() => {
          scriptRepo.initButtonContainer();
          qrBarDebounceTimer = null;
        }, 1000);
      }
    });
  });

  qrBarObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * 取消监听#qr--bar
 */
function removeMutationObserverQrBarCreated() {
  if (qrBarObserver) {
    qrBarObserver.disconnect();
    qrBarObserver = null;
  }

  if (qrBarDebounceTimer) {
    clearTimeout(qrBarDebounceTimer);
    qrBarDebounceTimer = null;
  }
}

/**
 * 扩展开启时构建脚本库
 */
export async function buildScriptRepositoryOnExtension() {
  const register_events = () => {
    load_events.forEach(eventType => {
      eventSource.on(eventType, refreshScriptRepository);
    });
    delete_events.forEach(eventType => {
      eventSource.on(eventType, (character: any) => purgeEmbeddedScripts({ character }));
    });
  };

  await buildScriptRepository();
  register_events();
}

/**
 * 扩展关闭时销毁脚本库
 */
export function destroyScriptRepositoryOnExtension() {
  load_events.forEach(eventType => {
    eventSource.removeListener(eventType, refreshScriptRepository);
  });
  removeScriptRepository();
}
