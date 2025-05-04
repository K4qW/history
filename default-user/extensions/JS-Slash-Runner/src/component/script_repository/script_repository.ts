import { destroyIframe } from '@/component/message_iframe';
import { createDefaultScripts } from '@/component/script_repository/builtin_scripts';
import { script_url } from '@/script_url';
import third_party from '@/third_party.html';
import { extensionFolderPath, getSettingValue, saveSettingValue } from '@/util/extension_variables';
import { renderMarkdown } from '@/util/render_markdown';

import { characters, eventSource, this_chid } from '@sillytavern/script';
import { renderExtensionTemplateAsync, writeExtensionField } from '@sillytavern/scripts/extensions';
// @ts-ignore
import { selected_group } from '@sillytavern/scripts/group-chats';
import { POPUP_TYPE, callGenericPopup } from '@sillytavern/scripts/popup';
import { download, getFileText, getSortableDelay, uuidv4 } from '@sillytavern/scripts/utils';

interface IFrameElement extends HTMLIFrameElement {
  cleanup: () => void;
  [prop: string]: any;
}

export const defaultScriptSettings = {
  global_script_enabled: true,
  scriptsRepository: [] as Script[],
  characters_with_scripts: [] as string[],
};

export const templatePath = `${extensionFolderPath}/src/component/script_repository`;
const baseTemplate = $(
  await renderExtensionTemplateAsync(`${templatePath}`, 'script_item_template', {
    scriptName: '',
    id: '',
    moveTo: '',
    faIcon: '',
  }),
);

const defaultScriptTemplate = $(
  await renderExtensionTemplateAsync(`${templatePath}`, 'script_default_repository', {
    scriptName: '',
    id: '',
  }),
);

class Script {
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

  hasName(): boolean {
    return Boolean(this.name);
  }
}

export enum ScriptType {
  GLOBAL = 'global',
  CHARACTER = 'scope',
}

export class ScriptRepository {
  private static instance: ScriptRepository;
  private globalScripts: Script[] = [];
  private characterScripts: Script[] = [];
  private _isGlobalScriptEnabled: boolean = false;
  private _isScopedScriptEnabled: boolean = false;

  private constructor() {
    this.loadScripts();
  }

  public get isGlobalScriptEnabled(): boolean {
    return this._isGlobalScriptEnabled;
  }
  public get isScopedScriptEnabled(): boolean {
    return this._isScopedScriptEnabled;
  }

  public static getInstance(): ScriptRepository {
    if (!ScriptRepository.instance) {
      ScriptRepository.instance = new ScriptRepository();
    }
    return ScriptRepository.instance;
  }

  public static destroyInstance(): void {
    if (ScriptRepository.instance) {
      ScriptRepository.instance = undefined as unknown as ScriptRepository;
    }
  }

  /**
   * 脚本库原始数据
   */
  loadScripts() {
    this.globalScripts = getSettingValue('script.scriptsRepository') || [];
    // @ts-ignore
    this.characterScripts = characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];
  }

  /**
   * 获取脚本
   * @param id 脚本id
   * @returns 脚本
   */
  getScriptById(id: string) {
    return (
      this.globalScripts.find((s: Script) => s.id === id) || this.characterScripts.find((s: Script) => s.id === id)
    );
  }

  /**
   * 添加单个脚本到脚本库UI首位并保存到设置中
   * @param script 脚本
   * @param type 脚本类型
   */
  async addScript(script: Script, type: ScriptType) {
    if (!script.hasName()) {
      toastr.error('[Script] 保存失败，脚本名称为空');
    }
    await this.saveScript(script, type);
    await this.renderScript(script, type);
  }

  /**
   * 加载脚本库到界面
   */
  async loadScriptLibrary() {
    this.loadScripts();

    $('#global-script-list').empty();
    $('#scoped-script-list').empty();

    const $emptyTip = `<small>暂无可用脚本</small>`;
    const globalScriptArray = getSettingValue('script.scriptsRepository') ?? [];

    const charactersWithScripts = getSettingValue('script.characters_with_scripts');
    this._isGlobalScriptEnabled = getSettingValue('script.global_script_enabled') ?? false;
    //@ts-ignore
    this._isScopedScriptEnabled = charactersWithScripts?.includes(characters?.[this_chid]?.avatar) || false;
    // @ts-ignore
    const scopedScriptArray = characters[this_chid]?.data?.extensions?.TavernHelper_scripts ?? [];
    if (scopedScriptArray.length > 0 && this._isScopedScriptEnabled !== undefined) {
      await this.handleScriptToggle(ScriptType.CHARACTER, this._isScopedScriptEnabled, false);
    }
    $('#scoped-script-enable-toggle')
      .prop('checked', this._isScopedScriptEnabled)
      .on('click', (event: JQuery.ClickEvent) =>
        this.handleScriptToggle(ScriptType.CHARACTER, event.target.checked, true),
      );

    if (globalScriptArray.length > 0) {
      const globalScripts = globalScriptArray.map((scriptData: Script) => new Script(scriptData));
      await Promise.all(
        globalScripts.map(async (script: Script) => {
          const scriptHtml = await this.cloneTemplate(script, ScriptType.GLOBAL);
          $('#global-script-list').append(scriptHtml);
        }),
      );
    } else {
      $('#global-script-list').append($emptyTip);
    }
    if (scopedScriptArray.length > 0) {
      const scopedScripts = scopedScriptArray.map((scriptData: Script) => new Script(scriptData));
      await Promise.all(
        scopedScripts.map(async (script: Script) => {
          const scriptHtml = await this.cloneTemplate(script, ScriptType.CHARACTER);
          $('#scoped-script-list').append(scriptHtml);
        }),
      );
    } else {
      $('#scoped-script-list').append($emptyTip);
    }

    this.makeDraggable($(`#global-script-list`), ScriptType.GLOBAL);
    this.makeDraggable($(`#scoped-script-list`), ScriptType.CHARACTER);
  }

  /**
   * 运行指定类型的脚本
   * @param type 脚本类型
   */
  async runScriptsByType(type: ScriptType) {
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] 酒馆助手未启用，无法运行脚本');
      return;
    }
    if (type === ScriptType.GLOBAL && !this._isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this._isScopedScriptEnabled) {
      return;
    }

    const scripts = type === ScriptType.GLOBAL ? this.globalScripts : this.characterScripts;
    const enabledScripts = scripts.map((script, index) => ({ script, index })).filter(({ script }) => script.enabled);

    for (const { script } of enabledScripts) {
      // 不要保存设置
      await this.runScript(script, type, false);
    }
  }

  /**
   * 取消运行指定类型的脚本
   * @param type 脚本类型
   */
  async cancelRunScriptsByType(type: ScriptType) {
    const scripts = type === ScriptType.GLOBAL ? this.globalScripts : this.characterScripts;
    const enabledScripts = scripts.map((script, index) => ({ script, index })).filter(({ script }) => script.enabled);

    for (const { script } of enabledScripts) {
      // 不要保存设置
      await this.cancelRunScript(script, type, false);
    }
  }

  /**
   * 运行单个脚本
   * @param script 脚本
   * @param type 脚本类型
   * @param userInput 是否由用户输入,为true时,会设置enabled为true,并保存设置
   */
  async runScript(script: Script, type: ScriptType, userInput: boolean = true) {
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] 扩展未启用');
      return;
    }
    const typeName = type === ScriptType.GLOBAL ? '全局' : '局部';
    const index = script.id.startsWith('global')
      ? this.globalScripts.findIndex(s => s.id === script.id)
      : this.characterScripts.findIndex(s => s.id === script.id);
    if (index !== -1) {
      if (userInput) {
        script.enabled = true;
        await this.saveScript(script, type);
      }
    }

    if (type === ScriptType.GLOBAL && !this._isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this._isScopedScriptEnabled) {
      return;
    }

    try {
      const iframeElement = $('iframe').filter(
        (_index, element) => $(element).attr('script-id') === script.id,
      )[0] as IFrameElement;
      if (iframeElement) {
        await destroyIframe(iframeElement);
      }
      if (script.buttons) {
        this.removeButton(script);
      }

      const htmlContent = `
        <html>
        <head>
          ${third_party}
          <script>
            (function ($) {
              var original$ = $;
              window.$ = function (selector, context) {
                if (context === undefined || context === null) {
                  if (window.parent && window.parent.document) {
                    context = window.parent.document;
                  } else {
                    console.warn('无法访问 window.parent.document，将使用当前 iframe 的 document 作为上下文。');
                    context = window.document;
                  }
                }
                return original$(selector, context);
              };
            })(jQuery);

            SillyTavern = window.parent.SillyTavern.getContext();
            TavernHelper = window.parent.TavernHelper;
            for (const key in TavernHelper) {
              window[key] = TavernHelper[key];
            }
          </script>
          <script src="${script_url.get('iframe_client')}"></script>
        </head>
        <body>
          <script type="module">
            ${script.content}
          </script>
        </body>
        </html>
      `;

      const $iframe = $('<iframe>', {
        style: 'display: none;',
        id: `tavern-helper-script-${script.name}`,
        srcdoc: htmlContent,
        'script-id': script.id,
      });

      $iframe.on('load', () => {
        console.info(`[Script] 启用${typeName}脚本["${script.name}"]`);
      });

      $('body').append($iframe);
    } catch (error) {
      console.error(`[Script] ${typeName}脚本启用失败:["${script.name}"]`, error);
      toastr.error(`${typeName}脚本启用失败:["${script.name}"]`);
    }
  }

  /**
   * 取消运行单个脚本
   * @param script 脚本
   * @param type 脚本类型
   * @param userInput 是否由用户输入,为true时,会设置enabled为false,并保存设置
   */
  async cancelRunScript(script: Script, type: ScriptType, userInput: boolean = true) {
    const typeName = type === ScriptType.GLOBAL ? '全局' : '局部';
    const index =
      type === ScriptType.GLOBAL
        ? this.globalScripts.findIndex(s => s.id === script.id)
        : this.characterScripts.findIndex(s => s.id === script.id);
    if (index !== -1) {
      if (userInput) {
        script.enabled = false;
        await this.saveScript(script, type);
      }
      const iframeElement = $('iframe').filter(
        (_index, element) => $(element).attr('script-id') === script.id,
      )[0] as IFrameElement;
      if (iframeElement) {
        await destroyIframe(iframeElement);
      }
      console.info(`[Script] 禁用${typeName}脚本["${script.name}"]`);
    }
  }

  /**
   * 渲染单个脚本到界面
   * @param script 脚本
   * @param type 类型
   */
  async renderScript(script: Script, type: ScriptType) {
    const scriptHtml = await this.cloneTemplate(script, type);
    const $emptyTip =
      type === ScriptType.GLOBAL ? $(`#global-script-list`).find('small') : $(`#scoped-script-list`).find('small');
    if (type === ScriptType.GLOBAL) {
      $('#global-script-list').append(scriptHtml);
    } else {
      $('#scoped-script-list').append(scriptHtml);
    }

    if ($emptyTip.length > 0) {
      $emptyTip.remove();
    }
  }

  /**
   * 打开脚本编辑器
   * @param type 类型
   * @param scriptId 脚本ID
   */
  async openScriptEditor(type: ScriptType, scriptId?: string) {
    const $editorHtml = $(await renderExtensionTemplateAsync(`${templatePath}`, 'script_editor'));
    let script: Script | undefined;
    if (scriptId) {
      if (type === ScriptType.GLOBAL) {
        script = getSettingValue('script.scriptsRepository').find((s: Script) => s.id === scriptId);
      } else {
        // @ts-ignore
        script = characters[this_chid]?.data?.extensions?.TavernHelper_scripts.find((s: Script) => s.id === scriptId);
      }

      if (script) {
        $editorHtml.find('#script-name-input').val(script.name);
        $editorHtml.find('#script-content-textarea').val(script.content);
        $editorHtml.find('#script-info-textarea').val(script.info);
        if (script.buttons && script.buttons.length > 0) {
          script.buttons.forEach((button, index) => {
            const buttonId = `button-${index}`;
            const $buttonContent = $(`<div class="button-item" id="${buttonId}">
              <span class="drag-handle menu-handle">☰</span>
              <input type="checkbox" id="checkbox-${buttonId}" ${button.visible ? 'checked' : ''} />
              <input class="text_pole" type="text" id="text-${buttonId}" value="${button.name}"/>
              <div class="delete-button menu_button interactable">
                <i class="fa-solid fa-trash"></i>
              </div>
            </div>`);
            $editorHtml.find('.button-list').append($buttonContent);
            $(`#text-${buttonId}`).val(button.name);
            $(`#checkbox-${buttonId}`).prop('checked', button.visible);
          });
        }
      }
    }

    $editorHtml.find('#add-button-trigger').on('click', () => {
      const buttonId = `button-${$editorHtml.find('.button-list .button-item').length}`;
      const $buttonContent = $(`<div class="button-item" id="${buttonId}">
        <span class="drag-handle menu-handle">☰</span>
        <input type="checkbox" id="checkbox-${buttonId}" checked/>
        <input class="text_pole" type="text" id="text-${buttonId}"/>
        <div class="delete-button menu_button interactable">
          <i class="fa-solid fa-trash"></i>
        </div>
      </div>`);
      $editorHtml.find('.button-list').append($buttonContent);
    });
    //@ts-ignore
    $editorHtml.find('#script-button-content').sortable({
      handle: '.drag-handle',
      items: '.button-item',
    });

    $editorHtml.on('click', '.delete-button', (e: JQuery.ClickEvent) => {
      $(e.currentTarget).closest('.button-item').remove();
    });

    const popupResult = await callGenericPopup($editorHtml, POPUP_TYPE.CONFIRM, '', {
      okButton: '确认',
      cancelButton: '取消',
      wide: true,
      large: true,
    });

    if (popupResult) {
      const scriptName = $editorHtml.find('#script-name-input').val() as string;
      const scriptContent = $editorHtml.find('#script-content-textarea').val() as string;
      const scriptInfo = $editorHtml.find('#script-info-textarea').val() as string;
      const buttonArray = $editorHtml
        .find('.button-list')
        .find('.button-item')
        .map((_index, element) => {
          const buttonId = $(element).attr('id');
          if (!buttonId) return null;
          const buttonText = $(element).find(`#text-${buttonId}`).val() as string;
          const isVisible = $(element).find(`#checkbox-${buttonId}`).prop('checked');
          return {
            text: buttonText,
            visible: isVisible,
          };
        })
        .toArray()
        .filter(button => button && button.text && button.text.trim() !== '');

      if (scriptId && script) {
        this.cancelRunScript(script, type, false);
        if (script.buttons) {
          this.removeButton(script);
        }

        script.name = scriptName;
        script.content = scriptContent;
        script.info = scriptInfo;
        script.buttons = buttonArray.map(button => ({ name: button.text, visible: button.visible }));
        $(`#${script.id}`).find('.script-item-name').text(script.name);
        await this.saveScript(script, type);
        if (script.enabled) {
          await this.runScript(script, type, false);
          this.addButton(script);
        }
      } else {
        const newScript = new Script({
          name: scriptName,
          content: scriptContent,
          info: scriptInfo,
          enabled: false,
          buttons: buttonArray.map(button => ({ name: button.text, visible: button.visible })),
        });
        await this.addScript(newScript, type);
      }
    }
  }

  /**
   * 打开变量编辑器
   */
  async openVariableEditor() {
    const $editorHtml = $(await renderExtensionTemplateAsync(`${templatePath}`, 'script_variable_editor'));
    const $variableList = $editorHtml.find('#variable-list');
    const $addVariableTrigger = $editorHtml.find('#add-variable-trigger');

    if (this_chid) {
      // @ts-ignore
      const existingVariables = characters[this_chid]?.data?.extensions?.TavernHelper_characterScriptVariables || {};
      Object.entries(existingVariables).forEach(([name, value]) => {
        const $variableItem = $(
          `
        <div class="variable-item flex-container flexFlowColumn gap10">
        <div class="divider"></div>
          <div class="flex-container">
            <div class="flex spaceBetween alignItemsCenter width100p">
            <span>名称:</span>
              <i class="fa-solid fa-trash" style="font-size: calc(var(--mainFontSize) * 0.8); cursor: pointer; margin-right:5px;"></i>
            </div>
            <input type="text" value="${name}"/>
          </div>
          <div class="flex-container">
            <span>值:</span>
            <textarea rows="1">${value}</textarea>
          </div>
        </div>`,
        );
        $variableList.append($variableItem);
      });
    }

    $addVariableTrigger.on('click', () => {
      const $variableItem = $(
        `
        <div class="variable-item flex-container flexFlowColumn gap10">
        <div class="divider"></div>
          <div class="flex-container">
            <div class="flex spaceBetween alignItemsCenter width100p">
            <span>名称:</span>
              <i class="fa-solid fa-trash" style="font-size: calc(var(--mainFontSize) * 0.8); cursor: pointer; margin-right:5px;"></i>
            </div>
            <input type="text"/>
          </div>
          <div class="flex-container">
            <span>值:</span>
            <textarea rows="1"></textarea>
          </div>
        </div>`,
      );
      $variableList.append($variableItem);
    });

    $editorHtml.on('click', '.fa-trash', function () {
      $(this).closest('.variable-item').remove();
    });

    const popupResult = await callGenericPopup($editorHtml, POPUP_TYPE.CONFIRM, '', {
      okButton: '确认',
      cancelButton: '取消',
      large: true,
    });

    if (popupResult) {
      const variables: Record<string, string> = {};
      $variableList.find('.variable-item').each((_index, element) => {
        const $item = $(element);
        const name = $item.find('input[type="text"]').val()?.toString().trim();
        const value = $item.find('textarea').val()?.toString() || '';

        if (name) {
          variables[name] = value;
        }
      });

      if (this_chid) {
        await replaceCharacterScriptVariables(variables);
      } else {
        toastr.error('保存失败，当前角色为空');
      }
    }
  }

  /**
   * 删除脚本
   * @param id 脚本ID
   * @param type 类型
   */
  async deleteScript(id: string, type: ScriptType): Promise<void> {
    try {
      const script = this.getScriptById(id);
      if (!script) {
        throw new Error('[Script] 脚本不存在');
      }
      const array =
        type === ScriptType.GLOBAL
          ? getSettingValue('script.scriptsRepository') || []
          : // @ts-ignore
            characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];

      // eslint-disable-next-line no-shadow
      const existingScriptIndex = array.findIndex((script: Script) => script.id === id);
      if (existingScriptIndex !== -1) {
        array.splice(existingScriptIndex, 1);

        if (type === ScriptType.GLOBAL) {
          $('#global-script-list').find(`#${id}`).remove();
          await this.saveGlobalScripts(array);
        } else {
          $('#scoped-script-list').find(`#${id}`).remove();
          await this.saveCharacterScripts(array);
        }
        if (array.length === 0) {
          const $emptyTip = `<small>暂无可用脚本</small>`;
          type === ScriptType.GLOBAL
            ? $(`#global-script-list`).append($emptyTip)
            : $(`#scoped-script-list`).append($emptyTip);
        }

        this.cancelRunScript(script, type, false);
        this.removeButton(script);
        console.info(`[Script] 删除脚本["${script.name}"]`);
      }
    } catch (error) {
      console.error('[Script] 删除脚本时发生错误:', error);
      throw error;
    }
  }

  /**
   * 保存单个脚本到设置中，不存在则添加到末尾，存在则覆盖
   * @param script 脚本
   * @param type 脚本类型
   */
  async saveScript(script: Script, type: ScriptType) {
    const array =
      type === ScriptType.GLOBAL
        ? getSettingValue('script.scriptsRepository') || []
        : // @ts-ignore
          characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];
    const index = array.findIndex((s: Script) => s.id === script.id);
    if (index === -1) {
      array.push(script);
    } else {
      array[index] = script;
    }
    if (type === ScriptType.GLOBAL) {
      saveSettingValue('script.scriptsRepository', array);
    } else {
      await this.saveCharacterScripts(array);
    }
  }

  /**
   * 保存脚本数组到扩展数据
   * @param array 脚本数组
   */
  async saveGlobalScripts(array: Script[]) {
    saveSettingValue('script.scriptsRepository', array);
  }

  /**
   * 保存脚本数组到角色卡数据
   * @param array 脚本数组
   */
  async saveCharacterScripts(array: Script[]) {
    if (this_chid) {
      // @ts-ignore
      await writeExtensionField(this_chid, 'TavernHelper_scripts', array);
      const charactersWithScripts = getSettingValue('script.characters_with_scripts');
      if (!charactersWithScripts.includes(this_chid)) {
        charactersWithScripts.push(this_chid);
      }
      saveSettingValue('script.characters_with_scripts', charactersWithScripts);
    } else {
      toastr.error('保存失败，当前角色为空');
    }
  }
  /**
   * 使脚本库可拖拽调整顺序
   * @param list 脚本库列表
   * @param type 脚本类型
   */
  makeDraggable(list: JQuery<HTMLElement>, type: ScriptType) {
    //@ts-ignore
    list.sortable({
      delay: getSortableDelay(),
      handle: '.drag-handle',
      items: '.script-item',
      stop: async () => {
        const newOrder: string[] = [];

        list.find('> .script-item').each(function (this: HTMLElement) {
          const id = $(this).attr('id');
          if (id) {
            newOrder.push(id);
          }
        });

        const array =
          type === ScriptType.GLOBAL
            ? getSettingValue('script.scriptsRepository') || []
            : // @ts-ignore
              characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];

        const updatedScripts = newOrder
          .map(id => {
            return array.find((script: Script) => script.id === id);
          })
          .filter(Boolean);

        if (type === ScriptType.GLOBAL) {
          await this.saveGlobalScripts(updatedScripts);
        } else {
          await this.saveCharacterScripts(updatedScripts);
        }
      },
    });
  }
  /**
   * 移动到另一类仓库
   */
  async moveScriptToOtherType(script: Script, type: ScriptType) {
    try {
      const sourceArray =
        type === ScriptType.GLOBAL
          ? getSettingValue('script.scriptsRepository') || []
          : // @ts-ignore
            characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];

      const sourceIndex = sourceArray.findIndex((s: Script) => s.id === script.id);
      if (sourceIndex !== -1) {
        sourceArray.splice(sourceIndex, 1);

        if (type === ScriptType.GLOBAL) {
          await this.saveGlobalScripts(sourceArray);
          $('#global-script-list').find(`#${script.id}`).remove();
        } else {
          await this.saveCharacterScripts(sourceArray);
          $('#scoped-script-list').find(`#${script.id}`).remove();
        }

        const targetType = type === ScriptType.GLOBAL ? ScriptType.CHARACTER : ScriptType.GLOBAL;
        const targetArray =
          targetType === ScriptType.GLOBAL
            ? getSettingValue('script.scriptsRepository') || []
            : // @ts-ignore
              characters[this_chid]?.data?.extensions?.TavernHelper_scripts || [];

        targetArray.push(script);

        if (targetType === ScriptType.GLOBAL) {
          await this.saveGlobalScripts(targetArray);
          await this.renderScript(script, targetType);
          if (this._isGlobalScriptEnabled) {
            await this.runScript(script, targetType, false);
            this.addButton(script);
          } else {
            await this.cancelRunScript(script, targetType, false);
            this.removeButton(script);
          }
          console.info(`[Script] 移动脚本["${script.name}"]到全局仓库`);
        } else {
          await this.saveCharacterScripts(targetArray);
          await this.renderScript(script, targetType);
          if (this._isScopedScriptEnabled) {
            await this.runScript(script, targetType, false);
            this.addButton(script);
          } else {
            await this.cancelRunScript(script, targetType, false);
            this.removeButton(script);
          }
          console.info(`[Script] 移动脚本["${script.name}"]到局部仓库`);
        }
      } else {
        throw new Error('[Script] 脚本不存在');
      }
    } catch (error) {
      console.error('[Script] 移动脚本时发生错误:', error);
      toastr.error('移动脚本失败');
      throw error;
    }
  }

  /**
   * 克隆显示模板
   * @param script 脚本
   * @param type 类型,global 全局,scope 局部
   */
  async cloneTemplate(script: Script, type: ScriptType.GLOBAL | ScriptType.CHARACTER) {
    const scriptHtml = baseTemplate.clone();

    scriptHtml.attr('id', script.id);

    scriptHtml.find('.script-item-name').text(script.name);
    scriptHtml.find('.script-storage-location').addClass(type === 'global' ? 'move-to-scoped' : 'move-to-global');
    scriptHtml.find('.script-storage-location i').addClass(type === 'global' ? 'fa-arrow-down' : 'fa-arrow-up');

    const toggleId = `toggle-script-${script.id}`;
    scriptHtml.find('label').attr('for', toggleId);

    scriptHtml
      .find('.toggle-script')
      .attr('id', toggleId)
      .prop('checked', script.enabled)
      .on('change', async e => {
        const isChecked = !!$(e.target).prop('checked');

        scriptHtml.find('.script-toggle-on').toggle(isChecked);
        scriptHtml.find('.script-toggle-off').toggle(!isChecked);
        script.enabled = isChecked;
        await this.saveScript(script, type);
        // 不需要再保存一次
        if (isChecked) {
          await this.runScript(script, type, false);
          this.addButton(script);
        } else {
          await this.cancelRunScript(script, type, false);
          this.removeButton(script);
        }
      });

    scriptHtml
      .find('.script-toggle-on')
      .toggle(script.enabled)
      .on('click', async function () {
        $(this).hide();
        scriptHtml.find('.script-toggle-off').show();
      });

    scriptHtml
      .find('.script-toggle-off')
      .toggle(!script.enabled)
      .on('click', async function () {
        $(this).hide();
        scriptHtml.find('.script-toggle-on').show();
      });
    scriptHtml.find('.script-info').on('click', () => {
      const scriptInfo = this.getScriptById(script.id)?.info || '';
      const htmlText = renderMarkdown(scriptInfo);
      callGenericPopup(htmlText, POPUP_TYPE.DISPLAY, undefined, { wide: true });
    });

    scriptHtml.find('.edit-script').on('click', () => this.openScriptEditor(type, script.id));
    scriptHtml.find('.script-storage-location').on('click', () => this.moveScriptToOtherType(script, type));
    scriptHtml.find('.export-script').on('click', async () => {
      const getScript = this.getScriptById(script.id);
      if (!getScript) {
        toastr.error('脚本不存在');
        return;
      }
      // eslint-disable-next-line no-control-regex
      const fileName = `${getScript?.name.replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase()}.json`;
      const { enabled, ...scriptData } = getScript;
      const fileData = JSON.stringify(scriptData, null, 2);
      download(fileData, fileName, 'application/json');
    });
    scriptHtml.find('.delete-script').on('click', async () => {
      const confirm = await callGenericPopup('确定要删除这个脚本吗？', POPUP_TYPE.CONFIRM);

      if (!confirm) {
        return;
      }

      await this.deleteScript(script.id, type);

      scriptHtml.remove();
    });
    return scriptHtml;
  }

  /**
   * 克隆默认脚本模板
   * @param script 脚本
   * @param type 类型,global 全局,scope 局部
   */
  async cloneDefaultScriptTemplate(script: Script) {
    const scriptHtml = defaultScriptTemplate.clone();

    scriptHtml.attr('id', script.id);

    scriptHtml.find('.script-item-name').text(script.name);
    scriptHtml.find('.script-info').on('click', () => {
      const htmlText = renderMarkdown(script.info);
      callGenericPopup(htmlText, POPUP_TYPE.DISPLAY, undefined, { wide: true });
    });
    scriptHtml.find('.add-script').on('click', async () => {
      let target: ScriptType = ScriptType.GLOBAL;
      const template = $(await renderExtensionTemplateAsync(`${templatePath}`, 'script_import_target'));
      template.find('#script-import-target-global').on('input', () => (target = ScriptType.GLOBAL));
      template.find('#script-import-target-scoped').on('input', () => (target = ScriptType.CHARACTER));
      const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
        okButton: '确认',
        cancelButton: '取消',
      });
      if (!result) {
        return;
      }

      await this.confirmAndImport(script, target);
    });
    return scriptHtml;
  }

  /**
   * 加载默认脚本库
   */
  async loadDefaultScriptsRepository() {
    const defaultScriptList = $('<div id="default-script-list" class="flex-container flexFlowColumn"></div>');
    const defaultScripts = await createDefaultScripts();
    for (const script of defaultScripts) {
      const template = await this.cloneDefaultScriptTemplate(script);
      defaultScriptList.append(template);
    }
    await callGenericPopup(defaultScriptList, POPUP_TYPE.TEXT);
  }

  /**
   * 处理脚本启用开关的点击事件
   * @param type 类型,global 全局,scope 局部
   * @param enable 是否启用
   * @param userInput 是否由用户输入
   */
  async handleScriptToggle(type: ScriptType, enable: boolean, userInput: boolean = true) {
    if (type === ScriptType.GLOBAL) {
      if (userInput) {
        saveSettingValue('script.global_script_enabled', enable);
      }
      this._isGlobalScriptEnabled = enable;
      if (enable) {
        this.runScriptsByType(ScriptType.GLOBAL);
        this.addButtonsByType(ScriptType.GLOBAL);
      } else {
        this.cancelRunScriptsByType(ScriptType.GLOBAL);
        this.removeButtonsByType(ScriptType.GLOBAL);
      }
    } else {
      const charactersWithScripts = getSettingValue('script.characters_with_scripts');
      if (enable) {
        //@ts-ignore
        if (!charactersWithScripts.includes(characters?.[this_chid]?.avatar)) {
          //@ts-ignore
          charactersWithScripts.push(characters?.[this_chid]?.avatar);
        }
        this.runScriptsByType(ScriptType.CHARACTER);
        this.addButtonsByType(ScriptType.CHARACTER);
      } else {
        //@ts-ignore
        const index = charactersWithScripts.indexOf(characters?.[this_chid]?.avatar);
        if (index !== -1) {
          charactersWithScripts.splice(index, 1);
        }
        this.cancelRunScriptsByType(ScriptType.CHARACTER);
        this.removeButtonsByType(ScriptType.CHARACTER);
      }
      saveSettingValue('script.characters_with_scripts', charactersWithScripts);
    }
  }

  /**
   * 导入脚本文件
   * @param {File} file 文件
   * @param {boolean} type 脚本类型
   */
  async onScriptImportFileChange(file: File, type: ScriptType) {
    if (!file) {
      toastr.error('未提供文件。');
      return;
    }

    try {
      const fileText = await getFileText(file);
      const script = JSON.parse(fileText);
      if (!script.name) {
        throw new Error('[Script] 未提供脚本名称。');
      }
      await this.confirmAndImport(script, type);
    } catch (error) {
      console.error(error);
      toastr.error('无效的JSON文件。');
      return;
    }
  }

  /**
   * 检查角色中的嵌入式脚本
   */
  async checkEmbeddedScripts() {
    // @ts-ignore
    if (this_chid !== undefined && !selected_group) {
      // @ts-ignore
      const avatar = characters[this_chid]?.avatar;
      // @ts-ignore
      const scripts = characters[this_chid]?.data?.extensions?.TavernHelper_scripts;

      if (Array.isArray(scripts) && scripts.length > 0) {
        const charactersWithScripts = getSettingValue('script.characters_with_scripts');
        if (avatar && !charactersWithScripts.includes(avatar)) {
          // @ts-ignore
          const characterScripts = characters[this_chid]?.data?.extensions?.TavernHelper_scripts;
          if (Array.isArray(characterScripts) && characterScripts.length > 0) {
            const scopedScripts = characterScripts.map((scriptData: Script) => new Script(scriptData));
            scopedScripts.forEach(async (script: Script) => {
              const scriptHtml = await this.cloneTemplate(script, ScriptType.CHARACTER);
              $('#scoped-script-list').append(scriptHtml);
            });

            const template = await renderExtensionTemplateAsync(`${templatePath}`, 'script_allow_popup');
            const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
              okButton: '确认',
              cancelButton: '取消',
            });

            if (result) {
              $('#scoped-script-enable-toggle').prop('checked', true);
              $('#scoped-script-list')
                .find('.toggle-script')
                .each(function () {
                  $(this).prop('checked', true).trigger('change');
                });
            }
            charactersWithScripts.push(avatar);
            saveSettingValue('script.characters_with_scripts', charactersWithScripts);
          }
        }
      }
    }
  }

  /**
   * 初始化按钮容器并添加按钮
   */
  initButtonContainer() {
    // 检查全局和局部脚本是否有可见按钮
    const hasGlobalVisibleButtons = this.globalScripts.some(
      script =>
        script.enabled && script.buttons && script.buttons.length > 0 && script.buttons.some(button => button.visible),
    );

    const hasCharacterVisibleButtons = this.characterScripts.some(
      script =>
        script.enabled && script.buttons && script.buttons.length > 0 && script.buttons.some(button => button.visible),
    );

    if (!hasGlobalVisibleButtons && !hasCharacterVisibleButtons) {
      return;
    }

    const $qrBar = $('#qr--bar');
    if (!$qrBar.length) {
      $('#send_form').append(
        '<div class="flex-container" id="qr--bar" style="gap: 0px;"><div class="qr--buttons qr--color" id="TH-script-buttons"></div></div>',
      );
    } else {
      $qrBar.css('gap', '0px').append('<div class="qr--buttons qr--color" id="TH-script-buttons"></div>');
    }
    this.addButtonsByType(ScriptType.GLOBAL);
    this.addButtonsByType(ScriptType.CHARACTER);
  }

  /**
   * 添加按钮
   * @param script 脚本
   */
  addButton(script: Script) {
    const type = this.getType(script);
    const isEnable = type === ScriptType.GLOBAL ? this._isGlobalScriptEnabled : this._isScopedScriptEnabled;
    if (!script.enabled || !isEnable) {
      return;
    }

    if (script.buttons && script.buttons.length > 0) {
      this.removeButton(script);

      script.buttons.forEach(button => {
        if (button.visible) {
          const event_type = `${script.id}_${button.name}`;
          $('#TH-script-buttons').append(
            `<div class="qr--button menu_button interactable" id="${event_type}">${button.name}</div>`,
          );
          $(`#${event_type}`).on('click', () => {
            eventSource.emit(`${event_type}`);
            console.log(`[Script] 点击按钮：${event_type}`);
          });
        }
      });
    } else {
      return;
    }
  }

  /**
   * 添加按钮
   * @param type 类型
   */
  addButtonsByType(type: ScriptType) {
    const scripts = type === ScriptType.GLOBAL ? this.globalScripts : this.characterScripts;
    for (const script of scripts) {
      this.addButton(script);
    }
  }

  /**
   * 移除按钮
   * @param script 脚本
   */
  removeButton(script: Script) {
    $(`[id*=${script.id}_]`).remove();
  }

  /**
   * 根据类型移除按钮
   * @param type 类型
   */
  removeButtonsByType(type: ScriptType) {
    const scripts = type === ScriptType.GLOBAL ? this.globalScripts : this.characterScripts;
    for (const script of scripts) {
      this.removeButton(script);
    }
  }

  async confirmAndImport(script: Script, type: ScriptType): Promise<void> {
    script = new Script({ ...script, enabled: false });

    let action: 'new' | 'override' | 'cancel' = 'new';

    const existing_script = this.getScriptById(script.id);
    if (existing_script) {
      const input = await callGenericPopup(
        `要导入的脚本 '${script.name}' 与脚本库中的 '${existing_script.name}' id 相同，是否要导入？`,
        POPUP_TYPE.TEXT,
        '',
        {
          okButton: '覆盖原脚本',
          cancelButton: '取消',
          customButtons: ['新建脚本'],
        },
      );

      switch (input) {
        case 0:
          action = 'cancel';
          break;
        case 1:
          action = 'override';
          break;
        case 2:
          action = 'new';
          break;
      }
    }

    switch (action) {
      case 'new':
        if (existing_script) {
          script.id = uuidv4();
        }
        break;
      case 'override':
        {
          if (!existing_script) {
            return;
          }

          $(`#${existing_script.id}`).remove();

          if (existing_script.enabled) {
            await this.cancelRunScript(existing_script, this.getType(existing_script), false);
            this.removeButton(existing_script);
          }
        }
        break;
      case 'cancel':
        return;
    }

    await this.saveScript(script, type);
    await this.renderScript(script, type);
    toastr.success(`脚本 '${script.name}' 导入成功。`);
  }

  getType(script: Script) {
    return this.globalScripts.some(s => script.id === s.id) ? ScriptType.GLOBAL : ScriptType.CHARACTER;
  }
}

/**
 * 从脚本允许列表中删除角色
 * @param param0
 */
export async function purgeEmbeddedScripts({ character }: { character: any }) {
  const avatar = character?.character?.avatar;
  const charactersWithScripts = getSettingValue('script.characters_with_scripts');
  if (avatar && charactersWithScripts?.includes(avatar)) {
    const index = charactersWithScripts.indexOf(avatar);
    if (index !== -1) {
      charactersWithScripts.splice(index, 1);
      saveSettingValue('script.characters_with_scripts', charactersWithScripts);
    }
  }
}

/**
 * 清理所有脚本iframe
 */
export async function clearAllScriptsIframe() {
  const $iframes = $('iframe[id^="tavern-helper-script-"]');
  for (const iframe of $iframes) {
    await destroyIframe(iframe as IFrameElement);
  }
}

/**
 * 获取脚本库局部变量
 * @returns 局部变量
 */
export function getCharacterScriptVariables(): Record<string, any> {
  // @ts-ignore
  return characters[this_chid]?.data?.extensions?.TavernHelper_characterScriptVariables || {};
}

/**
 * 替换角色脚本变量
 * @param variables 变量
 */
export async function replaceCharacterScriptVariables(variables: Record<string, any>): Promise<void> {
  // @ts-ignore
  await writeExtensionField(this_chid, 'TavernHelper_characterScriptVariables', variables);
}
