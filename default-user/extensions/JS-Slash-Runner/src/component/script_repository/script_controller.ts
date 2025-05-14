import { destroyIframe } from '@/component/message_iframe';
import { ScriptData } from '@/component/script_repository/data';
import { scriptEvents, ScriptRepositoryEventType } from '@/component/script_repository/events';
import { IFrameElement, Script, ScriptType } from '@/component/script_repository/types';
import { script_url } from '@/script_url';
import third_party from '@/third_party.html';
import { getSettingValue } from '@/util/extension_variables';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { uuidv4 } from '@sillytavern/scripts/utils';

class ScriptExecutor {
  /**
   * 创建并运行单个脚本
   * @param script 脚本
   * @param type 脚本类型
   */
  async runScript(script: Script, type: ScriptType): Promise<void> {
    const typeName = type === ScriptType.GLOBAL ? '全局' : '局部';

    try {
      // 先检查是否已经存在同名iframe，如果存在则销毁
      const iframeElement = $('iframe').filter(
        (_index, element) => $(element).attr('script-id') === script.id,
      )[0] as IFrameElement;

      if (iframeElement) {
        await destroyIframe(iframeElement);
      }

      // 创建运行脚本的HTML内容
      const htmlContent = this.createScriptHtml(script);

      // 创建新的iframe元素
      const $iframe = $('<iframe>', {
        style: 'display: none;',
        id: `tavern-helper-script-${script.name}`,
        srcdoc: htmlContent,
        'script-id': script.id,
      });

      // 设置加载事件
      $iframe.on('load', () => {
        console.info(`[Script] 启用${typeName}脚本["${script.name}"]`);
      });

      // 添加到页面
      $('body').append($iframe);
    } catch (error) {
      console.error(`[Script] ${typeName}脚本启用失败:["${script.name}"]`, error);
      toastr.error(`${typeName}脚本启用失败:["${script.name}"]`);
      throw error;
    }
  }

  /**
   * 停止单个脚本，并销毁iframe
   * @param script 脚本
   * @param type 脚本类型
   */
  async stopScript(script: Script, type: ScriptType): Promise<void> {
    const typeName = type === ScriptType.GLOBAL ? '全局' : '局部';

    const iframeElement = $('iframe').filter(
      (_index, element) => $(element).attr('script-id') === script.id,
    )[0] as IFrameElement;

    if (iframeElement) {
      await destroyIframe(iframeElement);
      console.info(`[Script] 禁用${typeName}脚本["${script.name}"]`);
    }
  }

  /**
   * 创建运行脚本的HTML内容
   * @param script 脚本对象
   * @returns HTML内容
   */
  private createScriptHtml(script: Script): string {
    return `
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
  }

  /**
   * 清理所有脚本iframe
   */
  async clearAllScriptsIframe(): Promise<void> {
    const $iframes = $('iframe[id^="tavern-helper-script-"]');
    for (const iframe of $iframes) {
      await destroyIframe(iframe as IFrameElement);
    }
  }
}

/**
 * 脚本管理器 - 负责脚本的运行、停止等核心功能
 * 作为统一入口，内部使用ScriptExecutor处理具体执行
 */
export class ScriptManager {
  private static instance: ScriptManager;
  private scriptData: ScriptData;
  private executor: ScriptExecutor;

  private constructor() {
    this.scriptData = ScriptData.getInstance();
    this.executor = new ScriptExecutor();
    this.registerEventListeners();
  }

  /**
   * 获取脚本管理器实例
   */
  public static getInstance(): ScriptManager {
    if (!ScriptManager.instance) {
      ScriptManager.instance = new ScriptManager();
    }
    return ScriptManager.instance;
  }

  /**
   * 销毁脚本管理器实例
   */
  public static destroyInstance(): void {
    if (ScriptManager.instance) {
      ScriptManager.instance = undefined as unknown as ScriptManager;
    }
  }

  /**
   * 注册事件监听器
   */
  private registerEventListeners(): void {
    // 脚本切换事件
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_TOGGLE, async data => {
      const { script, type, enable, userInput = true } = data;
      await this.toggleScript(script, type, enable, userInput);
    });

    // 类型切换事件
    scriptEvents.on(ScriptRepositoryEventType.TYPE_TOGGLE, async data => {
      const { type, enable, userInput = true } = data;
      await this.toggleScriptType(type, enable, userInput);
    });

    // 脚本导入事件
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_IMPORT, async data => {
      const { file, type } = data;
      await this.importScript(file, type);
    });

    // 脚本删除事件
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_DELETE, async data => {
      const { scriptId, type } = data;
      await this.deleteScript(scriptId, type);
    });

    // 脚本保存事件
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_SAVE, async data => {
      const { script, type } = data;
      await this.saveScript(script, type);
    });

    // 脚本移动事件
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_MOVE, async data => {
      const { script, fromType } = data;
      await this.moveScript(script, fromType);
    });

    // UI加载完成事件 - 自动运行已启用的脚本
    scriptEvents.on(ScriptRepositoryEventType.UI_LOADED, async () => {
      if (!getSettingValue('enabled_extension')) {
        return;
      }

      // 获取全局和角色脚本列表
      const globalScripts = this.scriptData.getGlobalScripts();
      const characterScripts = this.scriptData.getCharacterScripts();

      // 检查全局脚本类型开关是否启用
      if (this.scriptData.isGlobalScriptEnabled) {
        await this.runScriptsByType(globalScripts, ScriptType.GLOBAL);
      } else {
        console.info('[Script] 全局脚本类型未启用，跳过运行全局脚本');
      }

      // 检查角色脚本类型开关是否启用
      if (this.scriptData.isCharacterScriptEnabled) {
        await this.runScriptsByType(characterScripts, ScriptType.CHARACTER);
      } else {
        console.info('[Script] 角色脚本类型未启用，跳过运行角色脚本');
      }
    });
  }

  /**
   * 切换脚本启用状态
   * @param script 脚本
   * @param type 脚本类型
   * @param enable 是否启用
   * @param userInput 是否由用户输入
   */
  public async toggleScript(
    script: Script,
    type: ScriptType,
    enable: boolean,
    userInput: boolean = true,
  ): Promise<void> {
    if (userInput) {
      script.enabled = enable;
      await this.scriptData.saveScript(script, type);
    }

    try {
      if (enable) {
        // 检查对应类型的脚本总开关是否启用
        if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
          console.info(`[script_manager] 全局脚本类型未启用，跳过启用脚本["${script.name}"]`);
          return;
        }
        if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
          console.info(`[script_manager] 角色脚本类型未启用，跳过启用脚本["${script.name}"]`);
          return;
        }

        await this.runScript(script, type);
      } else {
        await this.stopScript(script, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'script_toggled',
        script,
        type,
        enable,
      });
    } catch (error) {
      console.error(`[Script] 切换脚本状态失败: ${script.name}`, error);
      toastr.error(`切换脚本状态失败: ${script.name}`);
    }
  }

  /**
   * 切换脚本类型启用状态
   * @param type 脚本类型
   * @param enable 是否启用
   * @param userInput 是否由用户输入
   */
  public async toggleScriptType(type: ScriptType, enable: boolean, userInput: boolean = true): Promise<void> {
    if (userInput) {
      await this.scriptData.updateScriptTypeEnableState(type, enable);
    }

    try {
      const scripts =
        type === ScriptType.GLOBAL ? this.scriptData.getGlobalScripts() : this.scriptData.getCharacterScripts();

      if (enable) {
        await this.runScriptsByType(scripts, type);
      } else {
        await this.stopScriptsByType(scripts, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'type_toggled',
        type,
        enable,
      });
    } catch (error) {
      console.error(`[Script] 切换脚本类型状态失败: ${type}`, error);
      toastr.error(`切换脚本类型状态失败: ${type}`);
    }
  }

  /**
   * 运行单个脚本
   * @param script 脚本
   * @param type 脚本类型
   */
  public async runScript(script: Script, type: ScriptType): Promise<void> {
    // 检查扩展是否启用
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] 扩展未启用');
      return;
    }

    // 检查相应类型的脚本是否启用
    if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
      return;
    }

    // 运行脚本
    await this.executor.runScript(script, type);

    // 处理按钮
    if (script.buttons && script.buttons.length > 0) {
      scriptEvents.emit(ScriptRepositoryEventType.BUTTON_ADD, { script });
    }
  }

  /**
   * 停止单个脚本
   * @param script 脚本
   * @param type 脚本类型
   */
  public async stopScript(script: Script, type: ScriptType): Promise<void> {
    await this.executor.stopScript(script, type);

    // 处理按钮
    if (script.buttons && script.buttons.length > 0) {
      scriptEvents.emit(ScriptRepositoryEventType.BUTTON_REMOVE, { scriptId: script.id });
    }
  }

  /**
   * 运行指定类型的所有脚本
   * @param scripts 脚本列表
   * @param type 脚本类型
   */
  public async runScriptsByType(scripts: Script[], type: ScriptType): Promise<void> {
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] 酒馆助手未启用，无法运行脚本');
      return;
    }

    // 检查相应类型的脚本是否启用
    if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
      return;
    }

    // 筛选启用的脚本
    const enabledScripts = scripts.filter(script => script.enabled);

    // 运行每个脚本
    for (const script of enabledScripts) {
      await this.executor.runScript(script, type);

      // 处理按钮
      if (script.buttons && script.buttons.length > 0) {
        scriptEvents.emit(ScriptRepositoryEventType.BUTTON_ADD, { script });
      }
    }
  }

  /**
   * 停止指定类型的所有脚本
   * @param scripts 脚本列表
   * @param type 脚本类型
   */
  public async stopScriptsByType(scripts: Script[], type: ScriptType): Promise<void> {
    const enabledScripts = scripts.filter(script => script.enabled);

    for (const script of enabledScripts) {
      await this.executor.stopScript(script, type);

      // 处理按钮
      if (script.buttons && script.buttons.length > 0) {
        scriptEvents.emit(ScriptRepositoryEventType.BUTTON_REMOVE, { scriptId: script.id });
      }
    }
  }

  /**
   * 导入脚本
   * @param file 文件
   * @param type 导入目标类型
   */
  public async importScript(file: File, type: ScriptType): Promise<void> {
    try {
      const content = await this.readFileAsText(file);
      const scriptData = JSON.parse(content);

      if (!scriptData.name || !scriptData.content) {
        throw new Error('无效的脚本数据');
      }

      // 新建脚本对象，默认为未启用状态
      const scriptToImport = new Script({
        ...scriptData,
        enabled: false,
      });

      // 分别检查全局和角色脚本中是否存在ID冲突
      const globalScripts = this.scriptData.getGlobalScripts();
      const characterScripts = this.scriptData.getCharacterScripts();

      // 检查全局脚本中是否存在冲突
      const conflictInGlobal = globalScripts.find(script => script.id === scriptToImport.id);
      // 检查角色脚本中是否存在冲突
      const conflictInCharacter = characterScripts.find(script => script.id === scriptToImport.id);

      // 确定是否存在冲突及冲突的类型
      let existingScript: Script | undefined;
      let conflictType: ScriptType | undefined;

      if (conflictInGlobal) {
        existingScript = conflictInGlobal;
        conflictType = ScriptType.GLOBAL;
      } else if (conflictInCharacter) {
        existingScript = conflictInCharacter;
        conflictType = ScriptType.CHARACTER;
      }

      // 如果存在冲突，处理冲突
      if (existingScript && conflictType) {
        const action = await this.handleScriptIdConflict(scriptToImport, existingScript, type);

        switch (action) {
          case 'new':
            // 生成新ID
            scriptToImport.id = uuidv4();
            await this.saveScript(scriptToImport, type);
            break;
          case 'override':
            // 先删除冲突的脚本（注意：使用冲突脚本的实际类型）
            await this.deleteScript(existingScript.id, conflictType);
            // 保存新脚本到目标类型
            await this.saveScript(scriptToImport, type);
            break;
          case 'cancel':
            return;
        }
      } else {
        // 无冲突，直接保存
        await this.saveScript(scriptToImport, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'script_imported',
        script: scriptToImport,
        type,
      });

      toastr.success(`脚本 '${scriptToImport.name}' 导入成功。`);
    } catch (error) {
      console.error('[script_repository] 导入脚本失败:', error);
      toastr.error('无效的JSON文件。');
    }
  }

  /**
   * 读取文件内容为文本 - 使用Promise代替回调
   * @param file 文件对象
   * @returns 文件内容
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * 保存脚本
   * @param script 脚本
   * @param type 脚本类型
   */
  public async saveScript(script: Script, type: ScriptType): Promise<void> {
    await this.scriptData.saveScript(script, type);
    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_saved',
      script,
      type,
    });
  }

  /**
   * 保存脚本顺序
   * @param scripts 排序后的脚本数组
   * @param type 脚本类型
   */
  public async saveScriptsOrder(scripts: Script[], type: ScriptType): Promise<void> {
    if (type === ScriptType.GLOBAL) {
      await this.scriptData.saveGlobalScripts(scripts);
    } else {
      await this.scriptData.saveCharacterScripts(scripts);
    }

    // 刷新本地数据
    this.scriptData.loadScripts();
  }

  /**
   * 删除脚本
   * @param scriptId 脚本ID
   * @param type 脚本类型
   */
  public async deleteScript(scriptId: string, type: ScriptType): Promise<void> {
    const script = this.scriptData.getScriptById(scriptId);
    if (!script) {
      throw new Error('[Script] 脚本不存在');
    }

    // 先停止脚本
    await this.stopScript(script, type);

    // 删除脚本
    await this.scriptData.deleteScript(scriptId, type);

    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_deleted',
      scriptId,
      type,
    });
  }

  /**
   * 移动脚本到另一个类型
   * @param script 脚本
   * @param fromType 源类型
   */
  public async moveScript(script: Script, fromType: ScriptType): Promise<void> {
    // 先停止脚本
    await this.stopScript(script, fromType);

    // 确定目标类型
    const targetType = fromType === ScriptType.GLOBAL ? ScriptType.CHARACTER : ScriptType.GLOBAL;

    // 检查目标类型中是否已存在相同ID的脚本
    const existingScriptInTarget = this.scriptData.getScriptById(script.id);
    const existingScriptType = existingScriptInTarget ? this.scriptData.getScriptType(existingScriptInTarget) : null;

    // 只有在目标类型中已存在同ID脚本时才处理冲突
    if (existingScriptInTarget && existingScriptType === targetType) {
      const action = await this.handleScriptIdConflict(script, existingScriptInTarget, targetType);

      switch (action) {
        case 'new':
          // 生成新ID
          script.id = uuidv4();
          break;
        case 'override':
          // 先删除目标类型中的脚本
          await this.deleteScript(existingScriptInTarget.id, targetType);
          break;
        case 'cancel':
          // 取消移动操作
          return;
      }
    }

    // 移动脚本
    await this.scriptData.moveScriptToOtherType(script, fromType);

    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_moved',
      script,
      fromType,
      targetType,
    });

    // 如果目标类型已启用，且脚本本身是启用状态，则启动脚本
    if (
      script.enabled &&
      ((targetType === ScriptType.GLOBAL && this.scriptData.isGlobalScriptEnabled) ||
        (targetType === ScriptType.CHARACTER && this.scriptData.isCharacterScriptEnabled))
    ) {
      await this.runScript(script, targetType);
    }
  }

  /**
   * 刷新角色脚本数据
   */
  public refreshCharacterScriptData(): void {
    this.scriptData.getCharacterScripts();
  }

  /**
   * 获取全局脚本
   */
  public getGlobalScripts(): Script[] {
    return this.scriptData.getGlobalScripts();
  }

  /**
   * 获取角色脚本
   */
  public getCharacterScripts(): Script[] {
    return this.scriptData.getCharacterScripts();
  }

  /**
   * 刷新角色脚本启用状态
   */
  public refreshCharacterScriptEnabledState(): void {
    this.scriptData.refreshCharacterScriptEnabledState();
  }

  /**
   * 获取全局脚本启用状态
   */
  public get isGlobalScriptEnabled(): boolean {
    return this.scriptData.isGlobalScriptEnabled;
  }

  /**
   * 获取角色脚本启用状态
   */
  public get isCharacterScriptEnabled(): boolean {
    return this.scriptData.isCharacterScriptEnabled;
  }

  /**
   * 根据ID获取脚本
   * @param id 脚本ID
   */
  public getScriptById(id: string): Script | undefined {
    return this.scriptData.getScriptById(id);
  }

  /**
   * 清理所有资源
   */
  public async cleanup(): Promise<void> {
    await this.executor.clearAllScriptsIframe();
  }

  /**
   * 处理脚本ID冲突
   * @param script 要处理的脚本
   * @param existingScript 已存在的脚本
   * @param targetType 目标类型
   * @returns 处理结果：'new' - 使用新ID, 'override' - 覆盖已有脚本, 'cancel' - 取消操作
   */
  public async handleScriptIdConflict(
    script: Script,
    existingScript: Script,
    targetType: ScriptType,
  ): Promise<'new' | 'override' | 'cancel'> {
    // 获取已存在脚本的类型文本
    const existingScriptType = this.scriptData.getScriptType(existingScript);
    const existingTypeText = existingScriptType === ScriptType.GLOBAL ? '全局脚本' : '角色脚本';

    // 获取目标类型文本
    const targetTypeText = targetType === ScriptType.GLOBAL ? '全局脚本' : '角色脚本';

    // 显示冲突处理选项
    const input = await callGenericPopup(
      `要${targetType === existingScriptType ? '导入' : '移动'}的脚本 '${script.name}' 与${existingTypeText}库中的 '${
        existingScript.name
      }' id 相同，是否要继续操作？`,
      POPUP_TYPE.TEXT,
      '',
      {
        okButton: '覆盖原脚本',
        cancelButton: '取消',
        customButtons: ['新建脚本'],
      },
    );

    let action: 'new' | 'override' | 'cancel' = 'cancel';

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

    return action;
  }
}
