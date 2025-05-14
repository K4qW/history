import { VariableDataType, VariableItem, VariableType } from '@/component/variable_manager/types';
import { getLastMessageId } from '@/function/util';
import {
  deleteVariable,
  getVariables,
  insertOrAssignVariables,
  replaceVariables,
  updateVariablesWith,
} from '@/function/variables';

export class VariableModel {
  private currentVariables: Record<string, any> = {};

  private activeVariableType: VariableType = 'global';

  private filterState: Record<VariableDataType, boolean> = {
    string: true,
    array: true,
    boolean: true,
    number: true,
    object: true,
  };

  private searchKeyword: string = '';

  private floorMinRange: number | null = null;
  private floorMaxRange: number | null = null;

  /**
   * 变量加载状态标志
   * @private
   */
  private _isLoading: boolean = false;

  /**
   * 变量加载防抖计时器
   * @private
   */
  private _loadDebounceTimeout: number | null = null;

  /**
   * 变量加载请求ID，用于取消过时的请求
   * @private
   */
  private _loadRequestId: number = 0;

  /**
   * 操作来源标记
   * 标记当前是否为内部操作（用户界面触发）
   * 用于避免同步服务对内部操作产生的事件进行重复处理
   * @private
   */
  private _isInternalOperation: boolean = false;

  /**
   * 操作计数器
   * 用于处理嵌套操作场景，确保最外层操作结束后才重置标记
   * @private
   */
  private _internalOperationCount: number = 0;

  constructor() {}

  /**
   * 获取变量是否正在加载
   */
  public get isLoading(): boolean {
    return this._isLoading;
  }

  /**
   * 标记开始内部操作
   * 通过内部操作标记，使同步服务能够识别并忽略由内部操作触发的事件
   */
  public beginInternalOperation(): void {
    this._internalOperationCount++;
    this._isInternalOperation = true;
  }

  /**
   * 标记结束内部操作
   * 仅当所有嵌套操作都完成时才重置标记
   */
  public endInternalOperation(): void {
    this._internalOperationCount = Math.max(0, this._internalOperationCount - 1);

    if (this._internalOperationCount === 0) {
      this._isInternalOperation = false;
    }
  }

  /**
   * 检查当前是否为内部操作
   * @returns 是否为内部操作
   */
  public isInternalOperation(): boolean {
    return this._isInternalOperation;
  }

  /**
   * 强制重置内部操作状态
   * 用于异常情况下的恢复
   */
  public resetInternalOperationState(): void {
    this._internalOperationCount = 0;
    this._isInternalOperation = false;
  }

  /**
   * 加载指定类型的变量
   * @param type 变量类型(global/character/chat/message)
   * @param preloadedVariables 预加载的变量数据，如果提供则直接使用而不再获取
   * @returns Promise<boolean> 加载是否成功完成
   */
  public async loadVariables(type: VariableType, preloadedVariables?: Record<string, any>): Promise<boolean> {
    // 如果类型没变，则不重新加载
    if (this.activeVariableType === type && Object.keys(this.currentVariables).length > 0) {
      return true;
    }

    // 取消之前的防抖计时器
    if (this._loadDebounceTimeout !== null) {
      window.clearTimeout(this._loadDebounceTimeout);
      this._loadDebounceTimeout = null;
    }

    // 生成新的请求ID
    const requestId = ++this._loadRequestId;

    // 返回一个Promise，在防抖后执行实际加载
    return new Promise<boolean>(resolve => {
      this._loadDebounceTimeout = window.setTimeout(async () => {
        // 如果当前请求已经过时，则取消
        if (requestId !== this._loadRequestId) {
          resolve(false);
          return;
        }

        // 设置加载状态
        this._isLoading = true;

        try {
          this.activeVariableType = type;

          if (type === 'message') {
            const [currentMinFloor, currentMaxFloor] = this.getFloorRange();
            const hasExistingRange = currentMinFloor !== null && currentMaxFloor !== null;

            if (!hasExistingRange) {
              const lastMessageId = getLastMessageId();

              const newMinFloor = Math.max(0, lastMessageId - 4);
              const newMaxFloor = lastMessageId;

              this.updateFloorRange(newMinFloor, newMaxFloor);
            }

            this.currentVariables = {};

            if (hasExistingRange || (currentMinFloor !== null && currentMaxFloor !== null)) {
              const minFloor = currentMinFloor!;
              const maxFloor = currentMaxFloor!;

              for (let floor = minFloor; floor <= maxFloor; floor++) {
                const floorVars = this.getFloorVariables(floor);
                const floorVarCount = Object.keys(floorVars).length;

                if (floorVarCount > 0) {
                  Object.assign(this.currentVariables, floorVars);
                }
              }
            }
          } else if (preloadedVariables) {
            // 如果提供了预加载的变量，则直接使用
            this.currentVariables = preloadedVariables;
          } else {
            // 否则重新获取变量
            this.currentVariables = getVariables({ type });
          }

          resolve(true);
        } catch (error) {
          console.error(`[VariableModel] 加载${type}变量失败:`, error);
          resolve(false);
        } finally {
          this._isLoading = false;
          this._loadDebounceTimeout = null;
        }
      }, 50); // 50ms防抖延迟
    });
  }

  /**
   * 获取当前加载的所有变量
   * @returns 当前变量
   */
  public getCurrentVariables(): Record<string, any> {
    return this.currentVariables;
  }

  /**
   * 获取当前活动的变量类型
   * @returns 变量类型
   */
  public getActiveVariableType(): VariableType {
    return this.activeVariableType;
  }

  /**
   * 获取特定变量的值
   * @param name 变量名称
   * @returns 变量值
   */
  public getVariableValue(name: string): any {
    return this.currentVariables[name];
  }

  /**
   * 保存变量数据
   * @param type 变量类型(global/character/chat/message)
   * @param name 变量名称
   * @param value 变量值
   * @param message_id 消息ID(仅用于message类型)
   */
  public async saveVariableData(type: VariableType, name: string, value: any, message_id?: number): Promise<void> {
    if (type === this.activeVariableType) {
      this.currentVariables[name] = value;
    }

    if (type === 'message' && message_id !== undefined) {
      await updateVariablesWith(data => ({ ...data, [name]: value }), { type, message_id });
    } else {
      await updateVariablesWith(data => ({ ...data, [name]: value }), { type });
    }
  }

  /**
   * 删除变量
   * @param type 变量类型(global/character/chat/message)
   * @param name 变量名称
   * @param message_id 消息ID(仅用于message类型)
   */
  public async deleteVariableData(type: VariableType, name: string, message_id?: number): Promise<void> {
    if (type === this.activeVariableType && this.currentVariables[name]) {
      delete this.currentVariables[name];
    }

    if (type === 'message' && message_id !== undefined) {
      await deleteVariable(name, { type, message_id });
    } else {
      await deleteVariable(name, { type });
    }
  }

  /**
   * 重命名变量（在单个事务中完成）
   * @param type 变量类型(global/character/chat/message)
   * @param oldName 旧变量名称
   * @param newName 新变量名称
   * @param value 变量值
   */
  public async renameVariable(type: VariableType, oldName: string, newName: string, value: any): Promise<void> {
    await updateVariablesWith(
      variables => {
        _.set(variables, newName, value);
        _.unset(variables, oldName);
        return variables;
      },
      { type },
    );

    if (type === this.activeVariableType) {
      this.currentVariables[newName] = value;
      delete this.currentVariables[oldName];
    }
  }

  /**
   * 更新列表变量的顺序
   * @param type 变量类型(global/character/chat/message)
   * @param name 变量名称
   * @param items 新的列表顺序
   */
  public async updateListOrder(type: VariableType, name: string, items: string[]): Promise<void> {
    if (type === this.activeVariableType && this.currentVariables[name] && Array.isArray(this.currentVariables[name])) {
      this.currentVariables[name] = items;
      await insertOrAssignVariables({ [name]: items }, { type });
    }
  }

  /**
   * 清除所有变量
   * @param type 变量类型(global/character/chat/message)
   */
  public async clearAllVariables(type: VariableType): Promise<void> {
    if (type === this.activeVariableType) {
      this.currentVariables = {};
    }

    // 消息类型变量需要逐层清除
    if (type === 'message') {
      const [minFloor, maxFloor] = this.getFloorRange();

      // 如果没有设置有效的楼层范围，则不执行操作
      if (minFloor === null || maxFloor === null) {
        console.warn('[VariableModel] 清除message变量失败: 未设置有效的楼层范围');
        return;
      }

      // 逐层清除变量
      for (let floor = minFloor; floor <= maxFloor; floor++) {
        try {
          await replaceVariables({}, { type: 'message', message_id: floor });
        } catch (error) {
          console.error(`[VariableModel] 清除第${floor}层变量失败:`, error);
        }
      }
    } else {
      // 其他类型变量直接替换为空对象
      await replaceVariables({}, { type });
    }
  }

  /**
   * 更新筛选状态
   * @param type 数据类型
   * @param checked 是否选中
   */
  public updateFilterState(type: VariableDataType, checked: boolean): void {
    this.filterState[type] = checked;
  }

  /**
   * 获取筛选状态
   * @returns 筛选状态
   */
  public getFilterState(): Record<VariableDataType, boolean> {
    return this.filterState;
  }

  /**
   * 更新搜索关键词
   * @param keyword 关键词
   */
  public updateSearchKeyword(keyword: string): void {
    this.searchKeyword = keyword;
  }

  /**
   * 获取搜索关键词
   * @returns 搜索关键词
   */
  public getSearchKeyword(): string {
    return this.searchKeyword;
  }

  /**
   * 更新楼层范围筛选
   * @param min 最小楼层
   * @param max 最大楼层
   */
  public updateFloorRange(min: number | null, max: number | null): void {
    if (min !== null) {
      min = Math.max(0, min);
    }

    this.floorMinRange = min;
    this.floorMaxRange = max;
  }

  /**
   * 获取当前楼层范围筛选
   * @returns 当前楼层范围 [min, max]
   */
  public getFloorRange(): [number | null, number | null] {
    return [this.floorMinRange, this.floorMaxRange];
  }

  /**
   * 获取特定楼层的变量数据
   * @param messageId 消息ID
   * @returns 楼层变量数据对象
   */
  public getFloorVariables(messageId: number): Record<string, any> {
    try {
      const variables = getVariables({ type: 'message', message_id: messageId });
      return variables || {};
    } catch (error) {
      console.error(`获取第${messageId}层变量失败:`, error);
      return {};
    }
  }

  /**
   * 转换变量到UI显示格式
   * @returns 格式化后的变量列表，用于UI显示
   */
  public formatVariablesForUI(): VariableItem[] {
    const result: VariableItem[] = [];

    for (const name in this.currentVariables) {
      const value = this.currentVariables[name];
      let type: VariableDataType = 'string';
      let formattedValue = value;

      if (Array.isArray(value)) {
        type = 'array';
      } else if (value === null) {
        type = 'string';
        formattedValue = 'null';
      } else if (value === undefined) {
        type = 'string';
        formattedValue = 'undefined';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'number') {
        type = 'number';
      } else if (typeof value === 'object') {
        type = 'object';
      } else if (typeof value === 'string') {
        type = 'string';
      }

      result.push({
        name,
        type,
        value: formattedValue,
      });
    }

    return result;
  }

  /**
   * 过滤变量列表
   * @param operationId 操作ID（用于日志追踪）
   * @returns 过滤后的变量列表
   */
  public filterVariables(): VariableItem[] {
    const initialVariables = this.formatVariablesForUI();

    if (Object.values(this.filterState).every(value => value === true) && !this.searchKeyword) {
      return initialVariables;
    }

    const filteredVariables = initialVariables.filter(variable => {
      const typeFilterPassed = this.filterState[variable.type];
      if (!typeFilterPassed) return false;

      if (this.searchKeyword) {
        const keyword = this.searchKeyword.toLowerCase();
        const nameMatch = variable.name.toLowerCase().includes(keyword);

        let valueMatch = false;
        if (['string', 'number', 'boolean'].includes(variable.type)) {
          const valueStr = String(variable.value).toLowerCase();
          valueMatch = valueStr.includes(keyword);
        }

        return nameMatch || valueMatch;
      }

      return true;
    });

    return filteredVariables;
  }

  /**
   * 强制刷新当前变量数据
   * @returns 是否刷新成功
   */
  public forceRefreshVariables(): boolean {
    try {
      if (this.activeVariableType !== 'message') {
        const latestVariables = getVariables({ type: this.activeVariableType });
        this.currentVariables = { ...latestVariables };
      }
      return true;
    } catch (error) {
      console.error(`[VariableModel] 强制刷新变量失败:`, error);
      return false;
    }
  }
}
